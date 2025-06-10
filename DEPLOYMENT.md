# STONK Token Deployment Guide

This guide will help you deploy the STONK token to Sepolia testnet.

## Prerequisites

1. **Node.js and npm** installed
2. **MetaMask** or another Ethereum wallet
3. **Sepolia ETH** for gas fees
4. **RPC Provider** (Alchemy, Infura, or QuickNode)

## Setup Instructions

### 1. Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Your private key (without 0x prefix)
# NEVER commit your actual private key to git!
PRIVATE_KEY=your_private_key_here

# Sepolia RPC URL - get from:
# - Alchemy: https://www.alchemy.com/
# - Infura: https://infura.io/
# - QuickNode: https://www.quicknode.com/
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY

# Optional: For contract verification
ETHERSCAN_API_KEY=your_etherscan_api_key_here
```

### 2. Get Sepolia ETH

Get free Sepolia ETH from these faucets:

- https://sepoliafaucet.com/
- https://www.alchemy.com/faucets/ethereum-sepolia
- https://faucet.quicknode.com/ethereum/sepolia

You'll need at least **0.01 ETH** for deployment.

### 3. Install Dependencies

```bash
npm install
```

### 4. Compile Contracts

```bash
npx hardhat compile
```

## Deployment

### Deploy STONK Token

Run the deployment script:

```bash
npx hardhat run scripts/deploy-sepolia.ts --network sepolia
```

The script will:

- ✅ Deploy STONK token with 1,000,000 supply
- ✅ Set up tax parameters (3% buy, 5% sell)
- ✅ Add deployer as timelock exemption
- ✅ Display all relevant information

### Expected Output

```
🚀 Deploying STONK Token to Sepolia Testnet
=====================================
Deploying contracts with the account: 0x1234...
Account balance: 0.05 ETH

📋 Token Configuration:
- Name: STONK
- Symbol: STONK
- Total Supply: 1000000 tokens
- Buy Tax: 3 %
- Sell Tax: 5 %

✅ STONK Token deployed successfully!
📍 Contract Address: 0xABC123...

🎉 DEPLOYMENT COMPLETE!
=====================================
📍 STONK Token Address: 0xABC123...
🏦 Total Supply: 1000000 STONK
💰 Your Balance: 1000000 STONK
```

## Post-Deployment

### 1. Add to MetaMask

Use the contract address from deployment output:

- **Token Address**: (from deployment output)
- **Token Symbol**: STONK
- **Decimals**: 18

### 2. Verify Contract (Optional)

```bash
npx hardhat verify --network sepolia CONTRACT_ADDRESS "DEPLOYER_ADDRESS" "STONK" "STONK" "1000000000000000000000000" "DEPLOYER_ADDRESS" "[300,500,50,'DEPLOYER_ADDRESS']"
```

Replace:

- `CONTRACT_ADDRESS` with deployed contract address
- `DEPLOYER_ADDRESS` with your wallet address

### 3. Create Uniswap Pair

1. Go to [Uniswap](https://app.uniswap.org/)
2. Connect your wallet
3. Switch to Sepolia network
4. Import your STONK token using contract address
5. Create a pool or add liquidity

## Token Details

- **Name**: STONK
- **Symbol**: STONK
- **Total Supply**: 1,000,000 STONK
- **Decimals**: 18
- **Buy Tax**: 3% (300 basis points)
- **Sell Tax**: 5% (500 basis points)
- **Market Hours**: NYSE trading hours enforced
- **Network**: Sepolia Testnet

## Market Hours Restrictions

The token enforces NYSE market hours:

- **Trading Hours**: 9:30 AM - 4:00 PM ET (Monday-Friday)
- **Blocked**: Weekends, holidays, after-hours
- **Exemptions**: Owner and designated addresses can trade anytime

## Troubleshooting

### Common Issues

1. **"Insufficient ETH"**: Get more Sepolia ETH from faucets
2. **"Network not found"**: Check your RPC URL in `.env`
3. **"Private key invalid"**: Ensure private key is correct (without 0x)
4. **"Market closed"**: Use `addTimelockExemption()` for testing

### Getting Help

- Check deployment output for detailed error messages
- Verify all environment variables are set correctly
- Ensure you have enough Sepolia ETH for gas fees
- Check Sepolia Etherscan for transaction details

## Security Notes

⚠️ **IMPORTANT**:

- Never commit your private key to git
- Use a separate wallet for testing
- Keep your `.env` file secure
- This is testnet only - do not use for mainnet without proper security review
