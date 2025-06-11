// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TimelockedAgentToken.sol";
import "./interfaces/ITimelockedAgentToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract TimelockedAgentTokenFactory {

    // Array to store all deployed token addresses
    TimelockedAgentToken[] public deployedTokens;

    event TokenDeployed(
        address indexed tokenAddress,
        string name,
        string symbol,
        uint256 initialSupply,
        address indexed owner
    );

    /**
     * @dev Deploys a new TimelockedAgentToken contract.
     * @param name The name of the token.
     * @param symbol The symbol of the token.
     * @param totalSupply The total supply of the token.
     * @param vault The vault address for the token.
     * @param projectTaxRecipient The recipient of project tax.
     * @param projectBuyTaxBasisPoints The buy tax basis points.
     * @param projectSellTaxBasisPoints The sell tax basis points.
     * @param taxSwapThresholdBasisPoints The swap threshold basis points.
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
    ) external returns (address) {
        // Deploy a new TimelockedAgentToken instance

        address owner = msg.sender; // Use the sender as the owner


        ITimelockedAgentToken.TaxParameters memory compatibleTaxParams = ITimelockedAgentToken.TaxParameters({
            projectTaxRecipient: projectTaxRecipient,
            projectBuyTaxBasisPoints: projectBuyTaxBasisPoints,
            projectSellTaxBasisPoints: projectSellTaxBasisPoints,
            taxSwapThresholdBasisPoints: taxSwapThresholdBasisPoints
        });
        
        TimelockedAgentToken token = new TimelockedAgentToken(
            owner, // Pass msg.sender as the owner
            name,
            symbol,
            totalSupply,
            vault,
            compatibleTaxParams
        );

        // Store the deployed token address
        deployedTokens.push(token);

        // Emit the TokenDeployed event
        emit TokenDeployed(
            address(token),
            name,
            symbol,
            totalSupply,
            owner
        );

        return address(token);
    }

    /**
     * @dev Returns the total number of deployed tokens.
     */
    function getDeployedTokensCount() external view returns (uint256) {
        return deployedTokens.length;
    }

    /**
     * @dev Returns the address of a deployed token at a specific index.
     * @param index The index of the deployed token.
     */
    function getDeployedToken(uint256 index) external view returns (address) {
        require(index < deployedTokens.length, "Index out of bounds");
        return address(deployedTokens[index]);
    }
}