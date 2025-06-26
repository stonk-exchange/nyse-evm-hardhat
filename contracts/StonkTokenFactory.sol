// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./StonkToken.sol";
import {BondingCurve as BondingCurveContract} from "./BondingCurve.sol";
import "./interfaces/IUniswapV2Factory.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "./interfaces/IStonkToken.sol";
import "./StonkTradingRouter.sol";

contract StonkTokenFactory is Ownable {
    // Public treasury address and fee price
    address public treasury;
    uint256 public feePrice;

    // Global supply for all tokens deployed through factory
    uint256 public globalTokenSupply;

    // Bonding curve trading fee (in basis points, e.g., 100 = 1%)
    uint256 public bondingCurveFeeBasisPoints;

    // Pause mechanism
    bool public paused;

    // Uniswap addresses
    IUniswapV2Factory public immutable uniswapFactory;
    IUniswapV2Router02 public immutable uniswapRouter;
    IERC20 public immutable assetToken; // e.g., USDC

    // Router for unified trading
    StonkTradingRouter public tradingRouter;

    // Bonding curve parameters
    uint256 public constant BONDING_CURVE_K = 3_000_000_000_000;
    uint256 public constant GRADUATION_THRESHOLD = 100_000 * 1e6; // e.g., 100k USDC
    uint256 public constant ASSET_RATE = 10000; // Added asset rate for K normalization

    event TokenDeployed(
        address indexed tokenAddress,
        address indexed bondingCurveAddress,
        string name,
        string symbol,
        uint256 initialSupply,
        address indexed owner,
        uint256 deploymentFee,
        uint256 timestamp
    );

    event TokenGraduated(
        address indexed tokenAddress,
        address indexed bondingCurveAddress,
        uint256 timestamp
    );

    event TokenTradingStateChanged(
        address indexed tokenAddress,
        bool isBondingCurve,
        bool isUniswap,
        uint256 timestamp
    );

    event FeePriceUpdated(
        uint256 indexed oldPrice,
        uint256 indexed newPrice,
        uint256 timestamp
    );
    event GlobalSupplyUpdated(
        uint256 indexed oldSupply,
        uint256 indexed newSupply,
        uint256 timestamp
    );
    event BondingCurveFeeUpdated(
        uint256 indexed oldFee,
        uint256 indexed newFee,
        uint256 timestamp
    );
    event TreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury,
        uint256 timestamp
    );
    event FeeCollected(
        address indexed token,
        uint256 indexed amount,
        address indexed treasury,
        uint256 timestamp
    );
    event Paused(address indexed account, uint256 timestamp);
    event Unpaused(address indexed account, uint256 timestamp);
    event TradingRouterUpdated(
        address indexed oldRouter,
        address indexed newRouter,
        uint256 timestamp
    );

    // Custom errors for gas efficiency
    error ContractPaused();
    error InsufficientFee();
    error ZeroAddress();
    error FeeTooHigh();
    error ArraysLengthMismatch();
    error TokenNotFound();

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    constructor(
        address _treasury,
        uint256 _feePrice,
        address _uniswapFactory,
        address _uniswapRouter,
        address _assetToken,
        uint256 _globalTokenSupply,
        uint256 _bondingCurveFeeBasisPoints
    ) Ownable(msg.sender) {
        treasury = _treasury;
        feePrice = _feePrice;
        globalTokenSupply = _globalTokenSupply;
        bondingCurveFeeBasisPoints = _bondingCurveFeeBasisPoints;
        uniswapFactory = IUniswapV2Factory(_uniswapFactory);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        assetToken = IERC20(_assetToken);
        paused = false;
    }

    function setFeePrice(uint256 _newFeePrice) external onlyOwner {
        uint256 oldPrice = feePrice;
        feePrice = _newFeePrice;
        emit FeePriceUpdated(oldPrice, _newFeePrice, block.timestamp);
    }

    function setGlobalTokenSupply(uint256 _newSupply) external onlyOwner {
        uint256 oldSupply = globalTokenSupply;
        globalTokenSupply = _newSupply;
        emit GlobalSupplyUpdated(oldSupply, _newSupply, block.timestamp);
    }

    function setBondingCurveFee(uint256 _newFeeBasisPoints) external onlyOwner {
        require(_newFeeBasisPoints <= 1000, "Fee cannot exceed 10%"); // Max 10%
        uint256 oldFee = bondingCurveFeeBasisPoints;
        bondingCurveFeeBasisPoints = _newFeeBasisPoints;
        emit BondingCurveFeeUpdated(
            oldFee,
            _newFeeBasisPoints,
            block.timestamp
        );
    }

    function setTreasury(address _newTreasury) external onlyOwner {
        require(_newTreasury != address(0), "Treasury cannot be zero address");
        address oldTreasury = treasury;
        treasury = _newTreasury;
        emit TreasuryUpdated(oldTreasury, _newTreasury, block.timestamp);
    }

    function setTradingRouter(address _tradingRouter) external onlyOwner {
        require(_tradingRouter != address(0), "Router cannot be zero address");
        tradingRouter = StonkTradingRouter(_tradingRouter);
        emit TradingRouterUpdated(address(0), _tradingRouter, block.timestamp);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender, block.timestamp);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender, block.timestamp);
    }

    // Helper function to create tax parameters (reduces stack usage)
    function _createTaxParameters(
        address projectTaxRecipient,
        uint16 projectBuyTaxBasisPoints,
        uint16 projectSellTaxBasisPoints,
        uint16 taxSwapThresholdBasisPoints
    ) internal pure returns (IStonkToken.TaxParameters memory) {
        return
            IStonkToken.TaxParameters({
                projectTaxRecipient: projectTaxRecipient,
                projectBuyTaxBasisPoints: projectBuyTaxBasisPoints,
                projectSellTaxBasisPoints: projectSellTaxBasisPoints,
                taxSwapThresholdBasisPoints: taxSwapThresholdBasisPoints
            });
    }

    function deployToken(
        string calldata name,
        string calldata symbol,
        address projectTaxRecipient,
        uint16 projectBuyTaxBasisPoints,
        uint16 projectSellTaxBasisPoints,
        uint16 taxSwapThresholdBasisPoints
    )
        external
        payable
        whenNotPaused
        returns (address tokenAddress, address bondingCurveAddress)
    {
        // Check fee payment and send to treasury
        require(msg.value >= feePrice, "Insufficient fee");
        payable(treasury).transfer(feePrice);

        // Refund excess if any
        if (msg.value > feePrice) {
            payable(msg.sender).transfer(msg.value - feePrice);
        }

        // Deploy bonding curve and token in sequence
        address bondingCurveAddr = address(
            new BondingCurveContract(
                address(assetToken),
                address(uniswapFactory),
                address(uniswapRouter),
                address(0),
                GRADUATION_THRESHOLD,
                ASSET_RATE,
                bondingCurveFeeBasisPoints,
                treasury
            )
        );

        address tokenAddr = address(
            new StonkToken(
                msg.sender,
                name,
                symbol,
                globalTokenSupply,
                bondingCurveAddr,
                _createTaxParameters(
                    projectTaxRecipient,
                    projectBuyTaxBasisPoints,
                    projectSellTaxBasisPoints,
                    taxSwapThresholdBasisPoints
                )
            )
        );

        // Set the token address in the bonding curve
        BondingCurveContract(bondingCurveAddr).setTokenAddress(tokenAddr);

        // Register token with trading router if set
        if (address(tradingRouter) != address(0)) {
            tradingRouter.registerToken(tokenAddr, bondingCurveAddr);
        }

        emit TokenDeployed(
            tokenAddr,
            bondingCurveAddr,
            name,
            symbol,
            globalTokenSupply,
            msg.sender,
            feePrice,
            block.timestamp
        );

        return (tokenAddr, bondingCurveAddr);
    }

    // Essential view functions only
    function getFactoryInfo()
        external
        view
        returns (
            address treasury_,
            uint256 feePrice_,
            uint256 globalTokenSupply_,
            uint256 bondingCurveFeeBasisPoints_,
            bool paused_,
            address tradingRouter_
        )
    {
        return (
            treasury,
            feePrice,
            globalTokenSupply,
            bondingCurveFeeBasisPoints,
            paused,
            address(tradingRouter)
        );
    }

    // Batch operations for gas efficiency
    function batchAddLiquidityPools(
        address[] calldata tokens,
        address[] calldata pools
    ) external onlyOwner whenNotPaused {
        require(tokens.length == pools.length, "Arrays length mismatch");

        for (uint256 i = 0; i < tokens.length; i++) {
            IStonkToken token = IStonkToken(tokens[i]);
            token.addLiquidityPool(pools[i]);
        }
    }

    function batchSetTaxRates(
        address[] calldata tokens,
        uint16[] calldata buyTaxes,
        uint16[] calldata sellTaxes
    ) external onlyOwner whenNotPaused {
        require(
            tokens.length == buyTaxes.length &&
                tokens.length == sellTaxes.length,
            "Arrays length mismatch"
        );

        for (uint256 i = 0; i < tokens.length; i++) {
            IStonkToken token = IStonkToken(tokens[i]);
            token.setProjectTaxRates(buyTaxes[i], sellTaxes[i]);
        }
    }

    // View functions for fee calculations
    function calculateBondingCurveFee(
        uint256 tradeAmount
    ) external view returns (uint256) {
        return (tradeAmount * bondingCurveFeeBasisPoints) / 10000;
    }

    function getBondingCurveFeeInfo()
        external
        view
        returns (uint256 feeBasisPoints, address feeTreasury)
    {
        return (bondingCurveFeeBasisPoints, treasury);
    }
}
