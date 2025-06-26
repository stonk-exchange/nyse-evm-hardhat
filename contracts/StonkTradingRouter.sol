// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./StonkTokenFactory.sol";
import {BondingCurve as BondingCurveContract} from "./BondingCurve.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "./interfaces/IUniswapV2Factory.sol";

contract StonkTradingRouter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    StonkTokenFactory public factory;
    IUniswapV2Router02 public uniswapRouter;
    IUniswapV2Factory public uniswapFactory;
    IERC20 public assetToken;

    // Token registration - minimal storage for subgraph
    mapping(address => address) public bondingCurveAddress; // token => bonding curve

    // Emergency pause mechanism
    bool public paused;

    // Events with comprehensive indexing for DAPP
    event TokenGraduated(
        address indexed tokenAddress,
        address indexed uniswapPair,
        uint256 indexed timestamp,
        uint256 tokenBalance,
        uint256 assetBalance
    );

    event TokensPurchased(
        address indexed tokenAddress,
        address indexed buyer,
        uint256 indexed tokenAmount,
        uint256 assetAmount,
        bool isBondingCurve,
        uint256 timestamp
    );

    event TokensSold(
        address indexed tokenAddress,
        address indexed seller,
        uint256 indexed tokenAmount,
        uint256 assetAmount,
        bool isBondingCurve,
        uint256 timestamp
    );

    event TokenRegistered(
        address indexed tokenAddress,
        address indexed bondingCurveAddress,
        uint256 indexed timestamp
    );

    event RouterPaused(address indexed by, uint256 timestamp);
    event RouterUnpaused(address indexed by, uint256 timestamp);

    // Custom errors for gas efficiency
    error ContractPaused();
    error TokenNotFound();
    error InvalidAmount();
    error DeadlinePassed();
    error AlreadyGraduated();
    error NotGraduated();
    error OnlyFactory();

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    constructor(
        address _factory,
        address _uniswapRouter,
        address _uniswapFactory,
        address _assetToken
    ) Ownable(msg.sender) {
        factory = StonkTokenFactory(_factory);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        uniswapFactory = IUniswapV2Factory(_uniswapFactory);
        assetToken = IERC20(_assetToken);
        paused = false;
    }

    // Emergency pause functions
    function pause() external onlyOwner {
        paused = true;
        emit RouterPaused(msg.sender, block.timestamp);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit RouterUnpaused(msg.sender, block.timestamp);
    }

    // Register a new token deployment
    function registerToken(
        address tokenAddress,
        address bondingCurveAddr
    ) external {
        if (msg.sender != address(factory)) revert OnlyFactory();
        bondingCurveAddress[tokenAddress] = bondingCurveAddr;
        emit TokenRegistered(tokenAddress, bondingCurveAddr, block.timestamp);
    }

    // Unified buy function that routes to appropriate mechanism
    function buyTokens(
        address tokenAddress,
        uint256 tokenAmount,
        uint256 maxAssetAmount,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 tokensReceived) {
        if (deadline < block.timestamp) revert DeadlinePassed();
        if (tokenAmount == 0) revert InvalidAmount();

        bool graduated = _isTokenGraduated(tokenAddress);

        if (graduated) {
            // Buy through Uniswap
            tokensReceived = _buyFromUniswap(
                tokenAddress,
                tokenAmount,
                maxAssetAmount,
                deadline
            );
            emit TokensPurchased(
                tokenAddress,
                msg.sender,
                tokensReceived,
                maxAssetAmount,
                false,
                block.timestamp
            );
        } else {
            // Buy through bonding curve
            tokensReceived = _buyFromBondingCurve(
                tokenAddress,
                tokenAmount,
                maxAssetAmount
            );
            emit TokensPurchased(
                tokenAddress,
                msg.sender,
                tokensReceived,
                maxAssetAmount,
                true,
                block.timestamp
            );
        }
    }

    // Unified sell function that routes to appropriate mechanism
    function sellTokens(
        address tokenAddress,
        uint256 tokenAmount,
        uint256 minAssetAmount,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 assetsReceived) {
        if (deadline < block.timestamp) revert DeadlinePassed();
        if (tokenAmount == 0) revert InvalidAmount();

        bool graduated = _isTokenGraduated(tokenAddress);

        if (graduated) {
            // Sell through Uniswap
            assetsReceived = _sellToUniswap(
                tokenAddress,
                tokenAmount,
                minAssetAmount,
                deadline
            );
            emit TokensSold(
                tokenAddress,
                msg.sender,
                tokenAmount,
                assetsReceived,
                false,
                block.timestamp
            );
        } else {
            // Sell through bonding curve
            assetsReceived = _sellToBondingCurve(
                tokenAddress,
                tokenAmount,
                minAssetAmount
            );
            emit TokensSold(
                tokenAddress,
                msg.sender,
                tokenAmount,
                assetsReceived,
                true,
                block.timestamp
            );
        }
    }

    // Calculate buy price (works for both mechanisms)
    function calculateBuyPrice(
        address tokenAddress,
        uint256 tokenAmount
    ) external view returns (uint256 assetAmount) {
        if (_isTokenGraduated(tokenAddress)) {
            // Calculate Uniswap price
            address[] memory path = new address[](2);
            path[0] = address(assetToken);
            path[1] = tokenAddress;

            uint256[] memory amounts = uniswapRouter.getAmountsIn(
                tokenAmount,
                path
            );
            assetAmount = amounts[0];
        } else {
            // Calculate bonding curve price
            address bondingCurveAddr = bondingCurveAddress[tokenAddress];
            if (bondingCurveAddr == address(0)) revert TokenNotFound();
            assetAmount = BondingCurveContract(bondingCurveAddr)
                .calculatePurchasePrice(tokenAmount);
        }
    }

    // Calculate sell proceeds (works for both mechanisms)
    function calculateSellProceeds(
        address tokenAddress,
        uint256 tokenAmount
    ) external view returns (uint256 assetAmount) {
        if (_isTokenGraduated(tokenAddress)) {
            // Calculate Uniswap price
            address[] memory path = new address[](2);
            path[0] = tokenAddress;
            path[1] = address(assetToken);

            uint256[] memory amounts = uniswapRouter.getAmountsOut(
                tokenAmount,
                path
            );
            assetAmount = amounts[1];
        } else {
            // Calculate bonding curve price
            address bondingCurveAddr = bondingCurveAddress[tokenAddress];
            if (bondingCurveAddr == address(0)) revert TokenNotFound();
            assetAmount = BondingCurveContract(bondingCurveAddr)
                .calculateSaleProceeds(tokenAmount);
        }
    }

    // Get token trading state
    function getTokenTradingState(
        address tokenAddress
    )
        external
        view
        returns (bool graduated, address bondingCurve, address uniswapPair)
    {
        bool isGraduated = _isTokenGraduated(tokenAddress);
        address pairAddress = address(0);

        if (isGraduated) {
            // Query the actual Uniswap pair address
            pairAddress = uniswapFactory.getPair(
                tokenAddress,
                address(assetToken)
            );
        }

        return (isGraduated, bondingCurveAddress[tokenAddress], pairAddress);
    }

    // Essential view functions only - subgraph will handle the rest
    function isTokenGraduated(
        address tokenAddress
    ) external view returns (bool) {
        return _isTokenGraduated(tokenAddress);
    }

    function getBondingCurveAddress(
        address tokenAddress
    ) external view returns (address) {
        return bondingCurveAddress[tokenAddress];
    }

    // Internal functions for actual trading
    function _buyFromBondingCurve(
        address tokenAddress,
        uint256 tokenAmount,
        uint256 maxAssetAmount
    ) internal returns (uint256 tokensReceived) {
        address bondingCurveAddr = bondingCurveAddress[tokenAddress];
        if (bondingCurveAddr == address(0)) revert TokenNotFound();

        // Transfer USDC from user to bonding curve
        assetToken.safeTransferFrom(
            msg.sender,
            bondingCurveAddr,
            maxAssetAmount
        );

        // Call buyTokens on bonding curve, which will send tokens to user
        BondingCurveContract(bondingCurveAddr).buyTokens(
            msg.sender,
            tokenAmount,
            maxAssetAmount
        );

        tokensReceived = tokenAmount;

        // Check if bonding curve graduated and update router state
        _checkAndUpdateGraduationStatus(tokenAddress);
    }

    function _sellToBondingCurve(
        address tokenAddress,
        uint256 tokenAmount,
        uint256 minAssetAmount
    ) internal returns (uint256 assetsReceived) {
        address bondingCurveAddr = bondingCurveAddress[tokenAddress];
        if (bondingCurveAddr == address(0)) revert TokenNotFound();

        // Transfer project tokens from user to bonding curve
        IERC20(tokenAddress).safeTransferFrom(
            msg.sender,
            bondingCurveAddr,
            tokenAmount
        );

        // Call sellTokens on bonding curve, which will send USDC to user
        BondingCurveContract(bondingCurveAddr).sellTokens(
            msg.sender,
            tokenAmount,
            minAssetAmount
        );

        // Get actual amount received
        assetsReceived = assetToken.balanceOf(msg.sender);

        // Check if bonding curve graduated and update router state
        _checkAndUpdateGraduationStatus(tokenAddress);
    }

    function _buyFromUniswap(
        address tokenAddress,
        uint256 tokenAmount,
        uint256 maxAssetAmount,
        uint256 deadline
    ) internal returns (uint256 tokensReceived) {
        address[] memory path = new address[](2);
        path[0] = address(assetToken);
        path[1] = tokenAddress;

        // Transfer USDC from user to router
        assetToken.safeTransferFrom(msg.sender, address(this), maxAssetAmount);

        // Approve USDC to Uniswap router
        assetToken.approve(address(uniswapRouter), maxAssetAmount);

        // Execute swap through Uniswap
        uint256[] memory amounts = uniswapRouter.swapTokensForExactTokens(
            tokenAmount,
            maxAssetAmount,
            path,
            msg.sender,
            deadline
        );

        tokensReceived = amounts[1];

        // Refund excess USDC to user
        uint256 excessAmount = maxAssetAmount - amounts[0];
        if (excessAmount > 0) {
            assetToken.safeTransfer(msg.sender, excessAmount);
        }
    }

    function _sellToUniswap(
        address tokenAddress,
        uint256 tokenAmount,
        uint256 minAssetAmount,
        uint256 deadline
    ) internal returns (uint256 assetsReceived) {
        address[] memory path = new address[](2);
        path[0] = tokenAddress;
        path[1] = address(assetToken);

        // Transfer tokens from user to router
        IERC20(tokenAddress).safeTransferFrom(
            msg.sender,
            address(this),
            tokenAmount
        );

        // Approve tokens to Uniswap router
        IERC20(tokenAddress).approve(address(uniswapRouter), tokenAmount);

        // Execute swap through Uniswap
        uint256[] memory amounts = uniswapRouter.swapExactTokensForTokens(
            tokenAmount,
            minAssetAmount,
            path,
            msg.sender,
            deadline
        );

        assetsReceived = amounts[1];
    }

    function _checkAndUpdateGraduationStatus(address tokenAddress) internal {
        address bondingCurveAddr = bondingCurveAddress[tokenAddress];
        if (bondingCurveAddr == address(0)) revert TokenNotFound();

        bool graduated = BondingCurveContract(bondingCurveAddr)
            .getGraduationStatus();
        if (graduated) {
            // Create Uniswap pair if it doesn't exist
            address pair = uniswapFactory.getPair(
                tokenAddress,
                address(assetToken)
            );
            if (pair == address(0)) {
                pair = uniswapFactory.createPair(
                    tokenAddress,
                    address(assetToken)
                );
            }

            emit TokenGraduated(
                tokenAddress,
                pair,
                block.timestamp,
                0, // tokenBalance - not needed for this event
                0 // assetBalance - not needed for this event
            );
        }
    }

    function _isTokenGraduated(
        address tokenAddress
    ) internal view returns (bool) {
        address bondingCurveAddr = bondingCurveAddress[tokenAddress];
        if (bondingCurveAddr == address(0)) revert TokenNotFound();
        return BondingCurveContract(bondingCurveAddr).getGraduationStatus();
    }
}
