// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IUniswapV2Factory.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "./interfaces/IUniswapV2Pair.sol";

interface IStonkToken is IERC20 {
    function addLiquidityPool(address pool) external;
}

contract BondingCurve is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant K = 3_000_000_000_000; // Bonding curve constant
    uint256 public constant PRECISION = 1e18;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MIN_LIQUIDITY = 1e18; // 1 token (adjust as needed)
    uint256 public constant MIN_ASSET_LIQUIDITY = 1e6; // 1 USDC (6 decimals, adjust as needed)

    // State variables
    IERC20 public assetToken; // The token used for buying/selling (e.g., USDC)
    IUniswapV2Factory public uniswapFactory;
    IUniswapV2Router02 public uniswapRouter;
    IStonkToken public stonkToken;
    uint256 public graduationThreshold;
    uint256 public assetRate; // Added assetRate for K normalization
    bool public isGraduated;

    // Fee management
    uint256 public feeBasisPoints;
    address public treasury;

    // Events
    event TokensPurchased(
        address indexed buyer,
        uint256 amount,
        uint256 cost,
        uint256 fee
    );
    event TokensSold(
        address indexed seller,
        uint256 amount,
        uint256 proceeds,
        uint256 fee
    );
    event TokenGraduated(
        address indexed token,
        uint256 timestamp,
        address indexed pair
    );
    event LiquidityAdded(uint256 tokenAmount, uint256 assetAmount);
    event TokenAddressSet(address indexed token);
    event FeeCollected(
        address indexed treasury,
        uint256 amount,
        string operation
    );

    // Errors
    error InsufficientAssetBalance();
    error InsufficientTokenBalance();
    error InvalidAmount();
    error AlreadyGraduated();
    error NotGraduated();
    error SlippageTooHigh();
    error TokenAlreadySet();
    error InvalidFee();

    constructor(
        address _assetToken,
        address _uniswapFactory,
        address _uniswapRouter,
        address _stonkToken,
        uint256 _graduationThreshold,
        uint256 _assetRate,
        uint256 _feeBasisPoints,
        address _treasury
    ) Ownable(msg.sender) {
        assetToken = IERC20(_assetToken);
        uniswapFactory = IUniswapV2Factory(_uniswapFactory);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        graduationThreshold = _graduationThreshold;
        assetRate = _assetRate;
        feeBasisPoints = _feeBasisPoints;
        treasury = _treasury;
        isGraduated = false;

        // Set token address if provided
        if (_stonkToken != address(0)) {
            stonkToken = IStonkToken(_stonkToken);
        }
    }

    function setTokenAddress(address _tokenAddress) external onlyOwner {
        if (address(stonkToken) != address(0)) {
            revert TokenAlreadySet();
        }
        stonkToken = IStonkToken(_tokenAddress);
        emit TokenAddressSet(_tokenAddress);
    }

    function calculatePurchasePrice(
        uint256 tokenAmount
    ) public view returns (uint256) {
        uint256 currentSupply = stonkToken.balanceOf(address(this));
        uint256 newSupply = currentSupply - tokenAmount;

        // Match live project's calculation exactly
        uint256 k = ((K * 10000) / assetRate);
        uint256 currentPrice = (k * PRECISION) / currentSupply;
        uint256 newPrice = (k * PRECISION) / newSupply;

        // Calculate average price for the purchase
        uint256 avgPrice = (currentPrice + newPrice) / 2;
        uint256 price = (avgPrice * tokenAmount) / PRECISION;

        return price;
    }

    function calculateSaleProceeds(
        uint256 tokenAmount
    ) public view returns (uint256) {
        uint256 currentSupply = stonkToken.balanceOf(address(this));
        uint256 newSupply = currentSupply + tokenAmount;

        // Match live project's calculation exactly
        uint256 k = ((K * 10000) / assetRate);
        uint256 currentPrice = (k * PRECISION) / currentSupply;
        uint256 newPrice = (k * PRECISION) / newSupply;

        // Calculate average price for the sale
        uint256 avgPrice = (currentPrice + newPrice) / 2;
        uint256 proceeds = (avgPrice * tokenAmount) / PRECISION;

        return proceeds;
    }

    function buyTokens(
        address to,
        uint256 tokenAmount,
        uint256 maxAssetAmount
    ) external nonReentrant {
        if (isGraduated) revert AlreadyGraduated();
        if (tokenAmount == 0) revert InvalidAmount();

        uint256 assetAmount = calculatePurchasePrice(tokenAmount);
        uint256 currentFeeBasisPoints = feeBasisPoints;
        uint256 fee = currentFeeBasisPoints > 0
            ? (assetAmount * currentFeeBasisPoints) / BASIS_POINTS
            : 0;
        uint256 totalAssetAmount = assetAmount + fee;

        if (totalAssetAmount > maxAssetAmount) revert SlippageTooHigh();

        // Check minimum reserve requirements
        uint256 currentTokenBalance = stonkToken.balanceOf(address(this));
        uint256 currentAssetBalance = assetToken.balanceOf(address(this));

        // Ensure we maintain minimum liquidity for Uniswap graduation
        if (currentTokenBalance - tokenAmount < MIN_LIQUIDITY) {
            revert InsufficientTokenBalance();
        }

        // Ensure we maintain minimum asset liquidity for Uniswap graduation
        if (currentAssetBalance + totalAssetAmount < MIN_ASSET_LIQUIDITY) {
            revert InsufficientAssetBalance();
        }

        // USDC is already in this contract (router sent it)
        // Transfer fee to treasury
        if (fee > 0) {
            assetToken.safeTransfer(treasury, fee);
            emit FeeCollected(treasury, fee, "buy");
        }

        // Transfer tokens to user
        stonkToken.transfer(to, tokenAmount);
        emit TokensPurchased(to, tokenAmount, assetAmount, fee);

        // Refund excess USDC to user
        uint256 excessAmount = maxAssetAmount - totalAssetAmount;
        if (excessAmount > 0) {
            assetToken.safeTransfer(to, excessAmount);
        }

        // Check for automatic graduation
        uint256 assetBalance = assetToken.balanceOf(address(this));
        if (assetBalance >= graduationThreshold && !isGraduated) {
            _graduate();
        }
    }

    function sellTokens(
        address to,
        uint256 tokenAmount,
        uint256 minAssetAmount
    ) external nonReentrant {
        if (isGraduated) revert AlreadyGraduated();
        if (tokenAmount == 0) revert InvalidAmount();

        uint256 assetAmount = calculateSaleProceeds(tokenAmount);
        uint256 currentFeeBasisPoints = feeBasisPoints;
        uint256 fee = currentFeeBasisPoints > 0
            ? (assetAmount * currentFeeBasisPoints) / BASIS_POINTS
            : 0;
        uint256 netAssetAmount = assetAmount - fee;

        if (netAssetAmount < minAssetAmount) revert SlippageTooHigh();

        // Project tokens are already in this contract (router sent them)
        // Transfer USDC to user
        assetToken.safeTransfer(to, netAssetAmount);
        // Transfer fee to treasury
        if (fee > 0) {
            assetToken.safeTransfer(treasury, fee);
            emit FeeCollected(treasury, fee, "sell");
        }
        emit TokensSold(to, tokenAmount, netAssetAmount, fee);
    }

    // Internal function to handle graduation
    function _graduate() internal {
        if (isGraduated) return;

        isGraduated = true;

        // Create Uniswap pair and add initial liquidity
        address pair = uniswapFactory.getPair(
            address(stonkToken),
            address(assetToken)
        );
        if (pair == address(0)) {
            pair = uniswapFactory.createPair(
                address(stonkToken),
                address(assetToken)
            );
        }

        // Add liquidity to Uniswap from bonding curve reserves
        uint256 tokenBalance = stonkToken.balanceOf(address(this));
        uint256 assetBalance = assetToken.balanceOf(address(this));

        if (tokenBalance > 0 && assetBalance > 0) {
            // Approve Uniswap router
            stonkToken.approve(address(uniswapRouter), tokenBalance);
            assetToken.approve(address(uniswapRouter), assetBalance);

            // Add liquidity to Uniswap
            uniswapRouter.addLiquidity(
                address(stonkToken),
                address(assetToken),
                tokenBalance,
                assetBalance,
                tokenBalance,
                assetBalance,
                address(this),
                block.timestamp + 15 minutes
            );

            emit LiquidityAdded(tokenBalance, assetBalance);
        }

        emit TokenGraduated(address(stonkToken), block.timestamp, pair);
    }

    // View functions
    function getCurrentPrice() public view returns (uint256) {
        uint256 currentSupply = stonkToken.balanceOf(address(this));
        uint256 k = ((K * 10000) / assetRate);
        return (k * PRECISION) / currentSupply;
    }

    function getGraduationStatus() public view returns (bool) {
        return isGraduated;
    }

    function getGraduationThreshold() public view returns (uint256) {
        return graduationThreshold;
    }

    // Fee calculation view functions
    function calculateBuyFee(
        uint256 tokenAmount
    ) external view returns (uint256 assetAmount, uint256 fee) {
        assetAmount = calculatePurchasePrice(tokenAmount);
        fee = feeBasisPoints > 0
            ? (assetAmount * feeBasisPoints) / BASIS_POINTS
            : 0;
    }

    function calculateSellFee(
        uint256 tokenAmount
    ) external view returns (uint256 assetAmount, uint256 fee) {
        assetAmount = calculateSaleProceeds(tokenAmount);
        fee = feeBasisPoints > 0
            ? (assetAmount * feeBasisPoints) / BASIS_POINTS
            : 0;
    }

    function getFeeInfo()
        external
        view
        returns (uint256 feeBasisPoints_, address treasury_)
    {
        return (feeBasisPoints, treasury);
    }
}
