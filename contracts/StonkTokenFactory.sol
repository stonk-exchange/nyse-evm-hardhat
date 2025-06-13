// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./StonkToken.sol";
import {BondingCurve as BondingCurveContract} from "./BondingCurve.sol";
import "./interfaces/IUniswapV2Factory.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "./interfaces/IStonkToken.sol";

contract StonkTokenFactory is Ownable {
    // Public treasury address and fee price
    address public treasury;
    uint256 public feePrice;

    // Uniswap addresses
    IUniswapV2Factory public immutable uniswapFactory;
    IUniswapV2Router02 public immutable uniswapRouter;
    IERC20 public immutable assetToken; // e.g., USDC

    // Bonding curve parameters
    uint256 public constant BONDING_CURVE_K = 3_000_000_000_000;
    uint256 public constant GRADUATION_THRESHOLD = 100_000 * 1e6; // e.g., 100k USDC
    uint256 public constant ASSET_RATE = 10000; // Added asset rate for K normalization

    struct TokenInfo {
        address token;
        address bondingCurve;
        bool isGraduated;
    }

    mapping(address => TokenInfo) public tokenInfo;
    address[] public deployedTokens;

    event TokenDeployed(
        address indexed tokenAddress,
        address indexed bondingCurveAddress,
        string name,
        string symbol,
        uint256 initialSupply,
        address indexed owner
    );

    event TokenGraduated(
        address indexed tokenAddress,
        address indexed bondingCurveAddress,
        uint256 timestamp
    );

    event FeePriceUpdated(uint256 oldPrice, uint256 newPrice);

    constructor(
        address _treasury,
        uint256 _feePrice,
        address _uniswapFactory,
        address _uniswapRouter,
        address _assetToken
    ) Ownable(msg.sender) {
        treasury = _treasury;
        feePrice = _feePrice;
        uniswapFactory = IUniswapV2Factory(_uniswapFactory);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        assetToken = IERC20(_assetToken);
    }

    function setFeePrice(uint256 _newFeePrice) external onlyOwner {
        uint256 oldPrice = feePrice;
        feePrice = _newFeePrice;
        emit FeePriceUpdated(oldPrice, _newFeePrice);
    }

    function deployToken(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        address projectTaxRecipient,
        uint16 projectBuyTaxBasisPoints,
        uint16 projectSellTaxBasisPoints,
        uint16 taxSwapThresholdBasisPoints
    )
        external
        payable
        returns (address tokenAddress, address bondingCurveAddress)
    {
        // Check fee payment and send to treasury
        require(msg.value >= feePrice, "Insufficient fee");
        payable(treasury).transfer(feePrice);

        // Refund excess if any
        if (msg.value > feePrice) {
            payable(msg.sender).transfer(msg.value - feePrice);
        }

        // Deploy token
        IStonkToken.TaxParameters memory taxParams = IStonkToken.TaxParameters({
            projectTaxRecipient: projectTaxRecipient,
            projectBuyTaxBasisPoints: projectBuyTaxBasisPoints,
            projectSellTaxBasisPoints: projectSellTaxBasisPoints,
            taxSwapThresholdBasisPoints: taxSwapThresholdBasisPoints
        });

        StonkToken token = new StonkToken(
            msg.sender, // sender becomes owner
            name,
            symbol,
            totalSupply,
            address(this), // factory becomes vault
            taxParams
        );

        // Deploy bonding curve
        BondingCurveContract bondingCurve = new BondingCurveContract(
            address(assetToken),
            address(uniswapFactory),
            address(uniswapRouter),
            address(token),
            GRADUATION_THRESHOLD,
            ASSET_RATE
        );

        // Transfer initial supply to bonding curve
        token.transfer(address(bondingCurve), totalSupply);

        // Store token info
        tokenInfo[address(token)] = TokenInfo({
            token: address(token),
            bondingCurve: address(bondingCurve),
            isGraduated: false
        });

        deployedTokens.push(address(token));

        emit TokenDeployed(
            address(token),
            address(bondingCurve),
            name,
            symbol,
            totalSupply,
            msg.sender
        );

        return (address(token), address(bondingCurve));
    }

    function getTokenInfo(
        address token
    ) external view returns (TokenInfo memory) {
        return tokenInfo[token];
    }

    function getDeployedTokens() external view returns (address[] memory) {
        return deployedTokens;
    }

    function getDeployedTokensCount() external view returns (uint256) {
        return deployedTokens.length;
    }
}
