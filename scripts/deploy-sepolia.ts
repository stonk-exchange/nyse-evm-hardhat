import { ethers } from "hardhat";
import { TimelockedAgentToken } from "../typechain-types";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("🚀 Deploying STONK Token to Sepolia Testnet");
  console.log("=====================================");
  console.log("Deploying contracts with the account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await deployer.provider.getBalance(deployer.address)),
    "ETH"
  );

  // Check if we have enough ETH for deployment
  const balance = await deployer.provider.getBalance(deployer.address);
  if (balance < ethers.parseEther("0.01")) {
    console.error(
      "❌ Insufficient ETH balance for deployment. Need at least 0.01 ETH"
    );
    console.error("Get Sepolia ETH from: https://sepoliafaucet.com/");
    process.exit(1);
  }

  // Token parameters
  const TOKEN_NAME = "STONK";
  const TOKEN_SYMBOL = "STONK";
  const TOTAL_SUPPLY = ethers.parseEther("1000000"); // 1,000,000 tokens

  // Tax parameters
  const TAX_PARAMS = {
    projectBuyTaxBasisPoints: 300, // 3%
    projectSellTaxBasisPoints: 500, // 5%
    taxSwapThresholdBasisPoints: 50, // 0.5%
    projectTaxRecipient: deployer.address, // Deployer receives tax
  };

  console.log("\n📋 Token Configuration:");
  console.log("- Name:", TOKEN_NAME);
  console.log("- Symbol:", TOKEN_SYMBOL);
  console.log("- Total Supply:", ethers.formatEther(TOTAL_SUPPLY), "tokens");
  console.log("- Buy Tax:", TAX_PARAMS.projectBuyTaxBasisPoints / 100, "%");
  console.log("- Sell Tax:", TAX_PARAMS.projectSellTaxBasisPoints / 100, "%");
  console.log("- Tax Recipient:", TAX_PARAMS.projectTaxRecipient);

  try {
    // Deploy the TimelockedAgentToken
    console.log("\n🔄 Deploying TimelockedAgentToken...");
    const TimelockedAgentToken = await ethers.getContractFactory(
      "TimelockedAgentToken"
    );

    const token = (await TimelockedAgentToken.deploy(
      deployer.address, // owner
      TOKEN_NAME, // name
      TOKEN_SYMBOL, // symbol
      TOTAL_SUPPLY, // total supply
      deployer.address, // vault (where tokens are initially minted)
      TAX_PARAMS
    )) as TimelockedAgentToken;

    console.log("⏳ Waiting for deployment confirmation...");
    await token.waitForDeployment();

    const tokenAddress = await token.getAddress();
    console.log("✅ STONK Token deployed successfully!");
    console.log("📍 Contract Address:", tokenAddress);

    // Verify deployment
    console.log("\n🔍 Verifying deployment...");
    const deployedName = await token.name();
    const deployedSymbol = await token.symbol();
    const deployedSupply = await token.totalSupply();
    const ownerBalance = await token.balanceOf(deployer.address);
    const buyTax = await token.totalBuyTaxBasisPoints();
    const sellTax = await token.totalSellTaxBasisPoints();
    const taxRecipient = await token.projectTaxRecipient();

    console.log("✅ Verification Results:");
    console.log("- Token Name:", deployedName);
    console.log("- Token Symbol:", deployedSymbol);
    console.log("- Total Supply:", ethers.formatEther(deployedSupply));
    console.log("- Owner Balance:", ethers.formatEther(ownerBalance));
    console.log("- Buy Tax:", buyTax.toString(), "basis points");
    console.log("- Sell Tax:", sellTax.toString(), "basis points");
    console.log("- Tax Recipient:", taxRecipient);

    // Check market state
    console.log("\n📊 Market Information:");
    const marketState = await token.getMarketState();
    const isMarketOpen = await token.isMarketOpen();
    const currentHoliday = await token.getCurrentHoliday();

    const marketStates = ["HOLIDAY", "WEEKEND", "AFTER_HOURS", "OPEN"];
    console.log("- Market State:", marketStates[Number(marketState)]);
    console.log("- Is Market Open:", isMarketOpen);
    if (currentHoliday) {
      console.log("- Current Holiday:", currentHoliday);
    }

    // Add deployer as timelock exemption for testing
    console.log("\n🔓 Setting up timelock exemption for deployer...");
    await token.addTimelockExemption(deployer.address);
    console.log("✅ Deployer added as timelock exemption");

    // Summary
    console.log("\n🎉 DEPLOYMENT COMPLETE!");
    console.log("=====================================");
    console.log("📍 STONK Token Address:", tokenAddress);
    console.log("🏦 Total Supply:", ethers.formatEther(TOTAL_SUPPLY), "STONK");
    console.log("💰 Your Balance:", ethers.formatEther(ownerBalance), "STONK");
    console.log("⛽ Gas Used: Check transaction details on Sepolia Etherscan");

    console.log("\n🔗 Useful Links:");
    console.log(
      "- Sepolia Etherscan:",
      `https://sepolia.etherscan.io/address/${tokenAddress}`
    );
    console.log("- Add to MetaMask:");
    console.log("  Token Address:", tokenAddress);
    console.log("  Token Symbol: STONK");
    console.log("  Decimals: 18");

    console.log("\n📝 Next Steps:");
    console.log("1. Verify contract on Etherscan (optional)");
    console.log("2. Add token to MetaMask using the address above");
    console.log("3. Create Uniswap pair for trading");
    console.log("4. Add liquidity to enable swapping");

    return {
      tokenAddress,
      deployer: deployer.address,
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      totalSupply: TOTAL_SUPPLY.toString(),
    };
  } catch (error) {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then((result) => {
    console.log("\n✅ Script completed successfully");
    console.log("📋 Deployment Details:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
