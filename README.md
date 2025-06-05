# TimelockedAgentToken

A sophisticated ERC20 token contract that combines trading day restrictions with tax functionality, designed for stock-like tokens that should only be tradeable during NYSE market hours.

## Features

### 🕒 Trading Hours Timelock

- **Market Hours**: Only allows transfers during NYSE trading hours (9:30 AM - 4:00 PM ET)
- **Holiday Detection**: Automatically blocks trading on NYSE holidays
- **Weekend Restrictions**: No trading on weekends
- **DST Support**: Automatically adjusts for Daylight Saving Time

### 💰 Tax System

- **Buy/Sell Taxes**: Configurable tax rates for buying and selling
- **Tax Collection**: Automatic tax collection and distribution
- **Tax Recipient**: Configurable recipient for collected taxes
- **Tax Distribution**: Manual distribution function for collected taxes

### 🔒 Access Control

- **Timelock Exemptions**: Certain addresses can be exempt from trading hour restrictions
- **Liquidity Pool Management**: Owner can add/remove liquidity pools for tax calculations
- **Owner Controls**: Comprehensive owner controls for all parameters

### 🔄 Upgradeable

- Built with OpenZeppelin's upgradeable contracts
- Proxy pattern for future upgrades

## Contract Architecture

### Core Components

1. **TimelockedAgentToken.sol** - Main contract implementing ERC20 with timelock and tax features
2. **ITimelockedAgentToken.sol** - Interface defining the contract's public API
3. **TradingDaysLibrary.sol** - Library handling all trading day calculations and validations

### Key Functions

#### Market State Management

```solidity
function getMarketState() external view returns (MarketState);
function isMarketOpen() external view returns (bool);
function getCurrentHoliday() external view returns (string memory);
```

#### Timelock Exemptions

```solidity
function addTimelockExemption(address account) external;
function removeTimelockExemption(address account) external;
function isExemptFromTimelock(address account) external view returns (bool);
```

#### Tax Management

```solidity
function setProjectTaxRates(uint16 newBuyTax, uint16 newSellTax) external;
function setProjectTaxRecipient(address recipient) external;
function distributeTaxTokens() external;
```

## Trading Day Logic

The contract implements comprehensive NYSE trading day logic:

### Market Hours

- **Open**: 9:30 AM ET
- **Close**: 4:00 PM ET
- **Timezone**: Automatically adjusts for Eastern Time (EST/EDT)

### Holidays Supported

- New Year's Day
- Martin Luther King Jr. Day (3rd Monday in January)
- Presidents Day (3rd Monday in February)
- Memorial Day (Last Monday in May)
- Independence Day
- Labor Day (1st Monday in September)
- Thanksgiving (4th Thursday in November)
- Christmas Day

### Market States

```solidity
enum MarketState {
    HOLIDAY,    // Market closed for holiday
    WEEKEND,    // Market closed for weekend
    AFTER_HOURS, // Outside trading hours
    OPEN        // Market is open for trading
}
```

## Tax System

### Tax Types

- **Buy Tax**: Applied when purchasing from liquidity pools
- **Sell Tax**: Applied when selling to liquidity pools
- **Basis Points**: Tax rates specified in basis points (100 = 1%)

### Tax Collection

- Taxes are automatically collected during transfers
- Collected taxes are held in the contract
- Manual distribution to tax recipient via `distributeTaxTokens()`

### Example Tax Calculation

```
Transfer Amount: 1000 tokens
Sell Tax Rate: 500 basis points (5%)
Tax Collected: 50 tokens
Amount Received: 950 tokens
```

## Deployment

### Prerequisites

```bash
npm install
```

### Deploy Script

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

### Test Suite

```bash
npx hardhat test
```

## Usage Examples

### Basic Transfer (During Market Hours)

```typescript
// Add address as timelock exemption
await token.addTimelockExemption(userAddress);

// Transfer tokens (only works during market hours for non-exempt addresses)
await token.transfer(recipientAddress, ethers.parseEther("100"));
```

### Tax Configuration

```typescript
// Set 3% buy tax, 5% sell tax
await token.setProjectTaxRates(300, 500);

// Set tax recipient
await token.setProjectTaxRecipient(treasuryAddress);

// Distribute collected taxes
await token.distributeTaxTokens();
```

### Liquidity Pool Management

```typescript
// Add liquidity pool for tax calculations
await token.addLiquidityPool(uniswapPairAddress);

// Remove liquidity pool
await token.removeLiquidityPool(oldPairAddress);
```

## Security Features

### Access Control

- Owner-only functions for critical operations
- Timelock exemption system for operational flexibility
- Emergency withdrawal functions for ETH and ERC20 tokens

### Transfer Restrictions

- Market hours enforcement (with exemptions)
- Proper tax calculation and collection
- Standard ERC20 security practices

## Testing

The project includes comprehensive tests covering:

- Market hours functionality
- Tax calculations
- Timelock exemptions
- Liquidity pool management
- Emergency functions
- Standard ERC20 functionality

Run tests with:

```bash
npx hardhat test
```

## Configuration

### Tax Parameters

```typescript
interface TaxParameters {
  projectBuyTaxBasisPoints: number; // Buy tax in basis points
  projectSellTaxBasisPoints: number; // Sell tax in basis points
  taxSwapThresholdBasisPoints: number; // Threshold for auto-swaps
  projectTaxRecipient: string; // Address to receive taxes
}
```

### Deployment Parameters

- Owner address
- Token name and symbol
- Total supply
- Vault address (initial token recipient)
- Tax parameters

## License

MIT License

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## Disclaimer

This contract is for educational and development purposes. Ensure thorough testing and auditing before any production use.
