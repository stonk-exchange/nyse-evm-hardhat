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

    // State variables
    IERC20 public assetToken; // The token used for buying/selling (e.g., USDC)
    IUniswapV2Factory public uniswapFactory;
    IUniswapV2Router02 public uniswapRouter;
    IStonkToken public stonkToken;
    uint256 public graduationThreshold;
    bool public isGraduated;

    // Events
    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost);
    event TokensSold(address indexed seller, uint256 amount, uint256 proceeds);
    event TokenGraduated(address indexed token, uint256 timestamp);
    event LiquidityAdded(uint256 tokenAmount, uint256 assetAmount);

    // Errors
    error InsufficientAssetBalance();
    error InsufficientTokenBalance();
    error InvalidAmount();
    error AlreadyGraduated();
    error NotGraduated();
    error SlippageTooHigh();

    constructor(
        address _assetToken,
        address _uniswapFactory,
        address _uniswapRouter,
        address _stonkToken,
        uint256 _graduationThreshold
    ) Ownable(msg.sender) {
        assetToken = IERC20(_assetToken);
        uniswapFactory = IUniswapV2Factory(_uniswapFactory);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        stonkToken = IStonkToken(_stonkToken);
        graduationThreshold = _graduationThreshold;
        isGraduated = false;
    }

    function calculatePurchasePrice(
        uint256 tokenAmount
    ) public view returns (uint256) {
        uint256 currentSupply = stonkToken.totalSupply();
        uint256 newSupply = currentSupply + tokenAmount;

        // Using the bonding curve formula: price = (K * (newSupply^2 - currentSupply^2)) / 2
        uint256 price = (K *
            (newSupply * newSupply - currentSupply * currentSupply)) / 2;
        return price;
    }

    function calculateSaleProceeds(
        uint256 tokenAmount
    ) public view returns (uint256) {
        uint256 currentSupply = stonkToken.totalSupply();
        uint256 newSupply = currentSupply - tokenAmount;

        // Using the bonding curve formula: proceeds = (K * (currentSupply^2 - newSupply^2)) / 2
        uint256 proceeds = (K *
            (currentSupply * currentSupply - newSupply * newSupply)) / 2;
        return proceeds;
    }

    function buyTokens(
        uint256 tokenAmount,
        uint256 maxAssetAmount
    ) external nonReentrant {
        if (isGraduated) revert AlreadyGraduated();
        if (tokenAmount == 0) revert InvalidAmount();

        uint256 assetAmount = calculatePurchasePrice(tokenAmount);
        if (assetAmount > maxAssetAmount) revert SlippageTooHigh();

        // Transfer assets from buyer
        assetToken.safeTransferFrom(msg.sender, address(this), assetAmount);

        // Mint tokens to buyer
        stonkToken.transfer(msg.sender, tokenAmount);

        // Check for graduation
        if (assetToken.balanceOf(address(this)) >= graduationThreshold) {
            _graduate();
        }

        emit TokensPurchased(msg.sender, tokenAmount, assetAmount);
    }

    function sellTokens(
        uint256 tokenAmount,
        uint256 minAssetAmount
    ) external nonReentrant {
        if (isGraduated) revert AlreadyGraduated();
        if (tokenAmount == 0) revert InvalidAmount();

        uint256 assetAmount = calculateSaleProceeds(tokenAmount);
        if (assetAmount < minAssetAmount) revert SlippageTooHigh();

        // Transfer tokens from seller
        stonkToken.transferFrom(msg.sender, address(this), tokenAmount);

        // Transfer assets to seller
        assetToken.safeTransfer(msg.sender, assetAmount);

        emit TokensSold(msg.sender, tokenAmount, assetAmount);
    }

    function _graduate() internal {
        if (isGraduated) return;

        isGraduated = true;

        // Create Uniswap pair
        address pair = uniswapFactory.createPair(
            address(stonkToken),
            address(assetToken)
        );

        // Add liquidity to Uniswap
        uint256 tokenBalance = stonkToken.balanceOf(address(this));
        uint256 assetBalance = assetToken.balanceOf(address(this));

        stonkToken.approve(address(uniswapRouter), tokenBalance);
        assetToken.approve(address(uniswapRouter), assetBalance);

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

        // Add the Uniswap pair as a liquidity pool
        stonkToken.addLiquidityPool(pair);

        emit TokenGraduated(address(stonkToken), block.timestamp);
        emit LiquidityAdded(tokenBalance, assetBalance);
    }

    // View functions
    function getCurrentPrice() public view returns (uint256) {
        uint256 currentSupply = stonkToken.totalSupply();
        return (K * currentSupply) / PRECISION;
    }

    function getGraduationStatus() public view returns (bool) {
        return isGraduated;
    }
}
