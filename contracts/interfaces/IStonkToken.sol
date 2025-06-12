// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStonkToken is IERC20 {
    struct TaxParameters {
        uint16 projectBuyTaxBasisPoints;
        uint16 projectSellTaxBasisPoints;
        uint16 taxSwapThresholdBasisPoints;
        address projectTaxRecipient;
    }

    enum MarketState {
        HOLIDAY,
        WEEKEND,
        AFTER_HOURS,
        OPEN
    }

    // Events
    event MarketClosed(MarketState state, string reason);
    event MarketOpened(address indexed firstTrader);
    event TimelockExemptionAdded(address indexed account);
    event TimelockExemptionRemoved(address indexed account);
    event ProjectTaxRecipientUpdated(address indexed newRecipient);
    event ProjectTaxBasisPointsChanged(
        uint16 oldBuyTax,
        uint16 newBuyTax,
        uint16 oldSellTax,
        uint16 newSellTax
    );
    event AutoSwapThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event LiquidityPoolAdded(address indexed pool);
    event LiquidityPoolRemoved(address indexed pool);

    // Market state functions
    function getMarketState() external view returns (MarketState);

    function getCurrentHoliday() external view returns (string memory);

    function isMarketOpen() external view returns (bool);

    // Timelock exemption functions
    function addTimelockExemption(address account) external;

    function removeTimelockExemption(address account) external;

    function isExemptFromTimelock(address account) external view returns (bool);

    function getTimelockExemptions() external view returns (address[] memory);

    // Liquidity pool management
    function addLiquidityPool(address pool) external;

    function removeLiquidityPool(address pool) external;

    function isLiquidityPool(address account) external view returns (bool);

    function getLiquidityPools() external view returns (address[] memory);

    // Tax management functions
    function setProjectTaxRecipient(address recipient) external;

    function setProjectTaxRates(uint16 newBuyTax, uint16 newSellTax) external;

    function setSwapThresholdBasisPoints(uint16 threshold) external;

    function distributeTaxTokens() external;

    // Tax view functions
    function totalBuyTaxBasisPoints() external view returns (uint256);

    function totalSellTaxBasisPoints() external view returns (uint256);

    function projectTaxRecipient() external view returns (address);

    function projectTaxPendingSwap() external view returns (uint128);

    // Emergency functions
    function withdrawETH(uint256 amount) external;

    function withdrawERC20(address token, uint256 amount) external;
}
