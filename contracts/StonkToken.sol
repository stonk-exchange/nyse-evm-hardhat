// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IStonkToken.sol";
import "./libraries/TradingDaysLibrary.sol";

contract StonkToken is ERC20, IStonkToken, Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;
    using TradingDaysLibrary for uint256;

    uint256 internal constant BP_DENOM = 10000;

    // Token State Variables
    bool internal _tokenHasTax;
    bool private _autoSwapInProgress;

    uint16 public projectBuyTaxBasisPoints;
    uint16 public projectSellTaxBasisPoints;
    uint16 public swapThresholdBasisPoints;

    address public projectTaxRecipient;
    uint128 public projectTaxPendingSwap;
    address public vault;

    // Mappings
    EnumerableSet.AddressSet private _liquidityPools;
    EnumerableSet.AddressSet private _exemptFromTimelock;

    event ExternalCallError(uint256 identifier);

    // Errors
    error MarketClosedForHoliday(string holiday);
    error MarketClosedForWeekend();
    error MarketClosedAfterHours();
    error TransferFailed();
    error CannotWithdrawThisToken();
    error LiquidityPoolCannotBeAddressZero();
    error LiquidityPoolMustBeAContractAddress();

    modifier onlyDuringMarketHours() {
        // _checkMarketHours(_msgSender());
        _;
    }

    constructor(
        address owner_,
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        address vault_,
        TaxParameters memory taxParams_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        vault = vault_;

        _tokenHasTax = _processTaxParams(taxParams_);
        swapThresholdBasisPoints = taxParams_.taxSwapThresholdBasisPoints;
        projectTaxRecipient = taxParams_.projectTaxRecipient;

        _mint(vault_, totalSupply_);
        _autoSwapInProgress = false;
    }

    function _processTaxParams(
        TaxParameters memory taxParams_
    ) internal returns (bool tokenHasTax_) {
        if (
            taxParams_.projectBuyTaxBasisPoints == 0 &&
            taxParams_.projectSellTaxBasisPoints == 0
        ) {
            return false;
        } else {
            projectBuyTaxBasisPoints = taxParams_.projectBuyTaxBasisPoints;
            projectSellTaxBasisPoints = taxParams_.projectSellTaxBasisPoints;
            return true;
        }
    }

    function _checkMarketHours(address account) internal view {
        // Skip timelock check for exempt addresses
        if (_exemptFromTimelock.contains(account)) {
            return;
        }

        MarketState state = getMarketState();

        if (state == MarketState.HOLIDAY) {
            revert MarketClosedForHoliday(getCurrentHoliday());
        } else if (state == MarketState.WEEKEND) {
            revert MarketClosedForWeekend();
        } else if (state == MarketState.AFTER_HOURS) {
            revert MarketClosedAfterHours();
        }
    }

    function getMarketState() public view override returns (MarketState) {
        uint256 easternTime = TradingDaysLibrary.getEasternTime();

        if (TradingDaysLibrary.isHoliday(easternTime)) {
            return MarketState.HOLIDAY;
        }

        if (TradingDaysLibrary.isWeekend(easternTime)) {
            return MarketState.WEEKEND;
        }

        if (!TradingDaysLibrary.isCoreTradingHours(easternTime)) {
            return MarketState.AFTER_HOURS;
        }

        return MarketState.OPEN;
    }

    function getCurrentHoliday() public view override returns (string memory) {
        return TradingDaysLibrary.getCurrentHoliday();
    }

    function isMarketOpen() public view override returns (bool) {
        return getMarketState() == MarketState.OPEN;
    }

    // Timelock exemption functions
    function addTimelockExemption(address account) external override onlyOwner {
        _exemptFromTimelock.add(account);
        emit TimelockExemptionAdded(account);
    }

    function removeTimelockExemption(
        address account
    ) external override onlyOwner {
        _exemptFromTimelock.remove(account);
        emit TimelockExemptionRemoved(account);
    }

    function isExemptFromTimelock(
        address account
    ) public view override returns (bool) {
        return _exemptFromTimelock.contains(account);
    }

    function getTimelockExemptions()
        external
        view
        override
        returns (address[] memory)
    {
        return _exemptFromTimelock.values();
    }

    // Liquidity pool management
    function addLiquidityPool(address pool) external override onlyOwner {
        if (pool == address(0)) {
            revert LiquidityPoolCannotBeAddressZero();
        }
        if (pool.code.length == 0) {
            revert LiquidityPoolMustBeAContractAddress();
        }
        _liquidityPools.add(pool);
        emit LiquidityPoolAdded(pool);
    }

    function removeLiquidityPool(address pool) external override onlyOwner {
        _liquidityPools.remove(pool);
        emit LiquidityPoolRemoved(pool);
    }

    function isLiquidityPool(
        address account
    ) public view override returns (bool) {
        return _liquidityPools.contains(account);
    }

    function getLiquidityPools()
        external
        view
        override
        returns (address[] memory)
    {
        return _liquidityPools.values();
    }

    // Tax management functions
    function setProjectTaxRecipient(
        address recipient
    ) external override onlyOwner {
        projectTaxRecipient = recipient;
        emit ProjectTaxRecipientUpdated(recipient);
    }

    function setProjectTaxRates(
        uint16 newBuyTax,
        uint16 newSellTax
    ) external override onlyOwner {
        uint16 oldBuyTax = projectBuyTaxBasisPoints;
        uint16 oldSellTax = projectSellTaxBasisPoints;

        projectBuyTaxBasisPoints = newBuyTax;
        projectSellTaxBasisPoints = newSellTax;

        emit ProjectTaxBasisPointsChanged(
            oldBuyTax,
            newBuyTax,
            oldSellTax,
            newSellTax
        );
    }

    function setSwapThresholdBasisPoints(
        uint16 threshold
    ) external override onlyOwner {
        uint256 oldThreshold = swapThresholdBasisPoints;
        swapThresholdBasisPoints = threshold;
        emit AutoSwapThresholdUpdated(oldThreshold, threshold);
    }

    // Override ERC20 transfer functions to add market hours check
    function transfer(
        address to,
        uint256 amount
    ) public override(ERC20, IERC20) onlyDuringMarketHours returns (bool) {
        address owner = _msgSender();
        _transferWithTax(
            owner,
            to,
            amount,
            (isLiquidityPool(owner) || isLiquidityPool(to))
        );
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override(ERC20, IERC20) onlyDuringMarketHours returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transferWithTax(
            from,
            to,
            amount,
            (isLiquidityPool(from) || isLiquidityPool(to))
        );
        return true;
    }

    // Internal transfer function with tax processing
    function _transferWithTax(
        address from,
        address to,
        uint256 amount,
        bool applyTax
    ) internal {
        uint256 amountMinusTax = _taxProcessing(applyTax, to, from, amount);

        // Use the standard ERC20 _transfer for the net amount
        super._transfer(from, to, amountMinusTax);
    }

    function _taxProcessing(
        bool applyTax,
        address to,
        address from,
        uint256 sentAmount
    ) internal returns (uint256 amountLessTax) {
        amountLessTax = sentAmount;

        // Early return if no tax processing needed
        if (!_tokenHasTax || !applyTax || _autoSwapInProgress) {
            return amountLessTax;
        }

        unchecked {
            uint256 tax;
            bool isToLiquidityPool = isLiquidityPool(to);
            bool isFromLiquidityPool = isLiquidityPool(from);

            // On sell (to liquidity pool)
            if (isToLiquidityPool && projectSellTaxBasisPoints > 0) {
                uint256 projectTax = (sentAmount * projectSellTaxBasisPoints) /
                    BP_DENOM;
                projectTaxPendingSwap += uint128(projectTax);
                tax += projectTax;
            }
            // On buy (from liquidity pool)
            else if (isFromLiquidityPool && projectBuyTaxBasisPoints > 0) {
                uint256 projectTax = (sentAmount * projectBuyTaxBasisPoints) /
                    BP_DENOM;
                projectTaxPendingSwap += uint128(projectTax);
                tax += projectTax;
            }

            if (tax > 0) {
                // Transfer tax to contract
                super._transfer(from, address(this), tax);
                amountLessTax -= tax;
            }
        }

        return amountLessTax;
    }

    function distributeTaxTokens() external override {
        if (projectTaxPendingSwap > 0) {
            uint256 projectDistribution = projectTaxPendingSwap;
            projectTaxPendingSwap = 0;
            super._transfer(
                address(this),
                projectTaxRecipient,
                projectDistribution
            );
        }
    }

    function withdrawETH(uint256 amount) external override onlyOwner {
        (bool success, ) = _msgSender().call{value: amount}("");
        if (!success) {
            revert TransferFailed();
        }
    }

    function withdrawERC20(
        address token,
        uint256 amount
    ) external override onlyOwner {
        if (token == address(this)) {
            revert CannotWithdrawThisToken();
        }
        IERC20(token).safeTransfer(_msgSender(), amount);
    }

    function burn(uint256 value) public {
        _burn(_msgSender(), value);
    }

    function burnFrom(address account, uint256 value) public {
        _spendAllowance(account, _msgSender(), value);
        _burn(account, value);
    }

    // View functions for tax information
    function totalBuyTaxBasisPoints() public view override returns (uint256) {
        return projectBuyTaxBasisPoints;
    }

    function totalSellTaxBasisPoints() public view override returns (uint256) {
        return projectSellTaxBasisPoints;
    }

    receive() external payable {}
}
