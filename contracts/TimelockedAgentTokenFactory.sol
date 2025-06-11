// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TimelockedAgentToken.sol";

contract TimelockedAgentTokenFactory {
    // Array to store all deployed token addresses
    TimelockedAgentToken[] public deployedTokens;

    // Event emitted when a new token is deployed
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
     * @param initialSupply The initial supply of the token.
     * @param owner The owner of the token.
     * @param projectTaxRecipient The recipient of project tax.
     * @param fundedDate The funded date for the token.
     * @param projectBuyTaxBasisPoints The buy tax basis points.
     * @param projectSellTaxBasisPoints The sell tax basis points.
     * @param swapThresholdBasisPoints The swap threshold basis points.
     */
    function deployToken(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address owner,
        address projectTaxRecipient,
        uint32 fundedDate,
        uint16 projectBuyTaxBasisPoints,
        uint16 projectSellTaxBasisPoints,
        uint16 swapThresholdBasisPoints
    ) external returns (address) {
        // Deploy a new TimelockedAgentToken instance
        TimelockedAgentToken token = new TimelockedAgentToken(
            name,
            symbol,
            initialSupply,
            owner,
            projectTaxRecipient,
            fundedDate,
            projectBuyTaxBasisPoints,
            projectSellTaxBasisPoints,
            swapThresholdBasisPoints
        );

        // Store the deployed token address
        deployedTokens.push(token);

        // Emit the TokenDeployed event
        emit TokenDeployed(
            address(token),
            name,
            symbol,
            initialSupply,
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