// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TimelockedAgentToken.sol";
import "./interfaces/ITimelockedAgentToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TimelockedAgentTokenFactory is Ownable {
    // Public treasury address and fee price
    address public treasury;
    uint256 public feePrice;

    event TokenDeployed(
        address indexed tokenAddress,
        string name,
        string symbol,
        uint256 initialSupply,
        address indexed owner
    );

    event FeePriceUpdated(uint256 oldPrice, uint256 newPrice);

    /**
     * @dev Constructor sets the treasury address and initial fee price.
     * @param _treasury The treasury address to receive fees.
     * @param _feePrice The initial fee price in wei.
     */
    constructor(address _treasury, uint256 _feePrice) Ownable(msg.sender) {
        treasury = _treasury;
        feePrice = _feePrice;
    }

    /**
     * @dev Owner can change the fee price at any time.
     * @param _newFeePrice The new fee price in wei.
     */
    function setFeePrice(uint256 _newFeePrice) external onlyOwner {
        uint256 oldPrice = feePrice;
        feePrice = _newFeePrice;
        emit FeePriceUpdated(oldPrice, _newFeePrice);
    }

    /**
     * @dev Deploys a new TimelockedAgentToken contract.
     */
    function deployToken(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        address vault,
        address projectTaxRecipient,
        uint16 projectBuyTaxBasisPoints,
        uint16 projectSellTaxBasisPoints,
        uint16 taxSwapThresholdBasisPoints
    ) external payable returns (address) {
        // Check fee payment and send to treasury
        require(msg.value >= feePrice, "Insufficient fee");
        payable(treasury).transfer(feePrice);

        // Refund excess if any
        if (msg.value > feePrice) {
            payable(msg.sender).transfer(msg.value - feePrice);
        }

        // Deploy token
        ITimelockedAgentToken.TaxParameters
            memory taxParams = ITimelockedAgentToken.TaxParameters({
                projectTaxRecipient: projectTaxRecipient,
                projectBuyTaxBasisPoints: projectBuyTaxBasisPoints,
                projectSellTaxBasisPoints: projectSellTaxBasisPoints,
                taxSwapThresholdBasisPoints: taxSwapThresholdBasisPoints
            });

        TimelockedAgentToken token = new TimelockedAgentToken(
            msg.sender, // sender becomes owner
            name,
            symbol,
            totalSupply,
            vault,
            taxParams
        );

        emit TokenDeployed(
            address(token),
            name,
            symbol,
            totalSupply,
            msg.sender
        );
        return address(token);
    }
}
