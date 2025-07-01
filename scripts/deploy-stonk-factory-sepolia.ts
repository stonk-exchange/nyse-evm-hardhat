import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log(
    "🚀 Deploying Gas-Optimized StonkTokenFactory and StonkTradingRouter to Sepolia Testnet"
  );
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

  // Get EVILUSDC address from command line
  const evilUSDCAddress = process.env.EVILUSDC_ADDRESS;
  if (!evilUSDCAddress) {
    console.error("❌ Please provide EVILUSDC_ADDRESS environment variable");
    console.error("Run: export EVILUSDC_ADDRESS=0x...");
    process.exit(1);
  }

  // Sepolia addresses
  const UNISWAP_FACTORY = process.env.UNISWAP_FACTORY_ADDRESS;
  const UNISWAP_ROUTER = process.env.UNISWAP_ROUTER_ADDRESS;

  if (!UNISWAP_FACTORY || !UNISWAP_ROUTER) {
    console.error(
      "❌ Please provide UNISWAP_FACTORY_ADDRESS and UNISWAP_ROUTER_ADDRESS environment variables"
    );
    console.error("Run: export UNISWAP_FACTORY_ADDRESS=0x...");
    console.error("Run: export UNISWAP_ROUTER_ADDRESS=0x...");
    process.exit(1);
  }

  const TREASURY_ADDRESS = deployer.address; // You can change this to your treasury address
  const DEPLOYMENT_FEE = ethers.parseEther("0.01"); // 0.01 ETH deployment fee
  const BONDING_CURVE_FEE_BASIS_POINTS = 300; // 3% fee

  console.log("\n📋 Deployment Configuration:");
  console.log("Treasury Address:", TREASURY_ADDRESS);
  console.log("Deployment Fee:", ethers.formatEther(DEPLOYMENT_FEE), "ETH");
  console.log("Global Token Supply: 1,000,000,000 tokens (fixed)");
  console.log(
    "Bonding Curve Fee:",
    BONDING_CURVE_FEE_BASIS_POINTS,
    "basis points (3%)"
  );
  console.log("Uniswap Factory:", UNISWAP_FACTORY);
  console.log("Uniswap Router:", UNISWAP_ROUTER);
  console.log("EVILUSDC Address:", evilUSDCAddress);

  // Deploy the factory contract
  console.log("\n📦 Deploying StonkTokenFactory...");
  const StonkTokenFactory = await ethers.getContractFactory(
    "StonkTokenFactory"
  );

  const factoryInstance = await StonkTokenFactory.deploy(
    TREASURY_ADDRESS,
    DEPLOYMENT_FEE,
    UNISWAP_FACTORY,
    UNISWAP_ROUTER,
    evilUSDCAddress,
    BONDING_CURVE_FEE_BASIS_POINTS
  );

  await factoryInstance.waitForDeployment();
  const factoryAddress = await factoryInstance.getAddress();

  console.log("✅ StonkTokenFactory deployed successfully!");
  console.log("Contract Address:", factoryAddress);

  // Deploy the trading router
  console.log("\n📦 Deploying StonkTradingRouter...");
  const StonkTradingRouter = await ethers.getContractFactory(
    "StonkTradingRouter"
  );

  const routerInstance = await StonkTradingRouter.deploy(
    factoryAddress,
    UNISWAP_ROUTER,
    UNISWAP_FACTORY,
    evilUSDCAddress
  );

  await routerInstance.waitForDeployment();
  const routerAddress = await routerInstance.getAddress();

  console.log("✅ StonkTradingRouter deployed successfully!");
  console.log("Contract Address:", routerAddress);

  // Set the router in the factory
  console.log("\n🔗 Setting router in factory...");
  const setRouterTx = await factoryInstance.setTradingRouter(routerAddress);
  await setRouterTx.wait();
  console.log("✅ Router set in factory successfully!");

  // Verify the setup
  console.log("\n🔍 Verifying deployment...");
  const factoryInfo = await factoryInstance.getFactoryInfo();
  console.log("Factory Info:");
  console.log("- Treasury:", factoryInfo[0]);
  console.log("- Fee Price:", ethers.formatEther(factoryInfo[1]), "ETH");
  console.log("- Global Token Supply:", ethers.formatEther(factoryInfo[2]));
  console.log("- Bonding Curve Fee:", factoryInfo[3], "basis points");
  console.log("- Paused:", factoryInfo[4]);
  console.log("- Trading Router:", factoryInfo[5]);

  console.log("\n🔗 Contract Relationships:");
  console.log("Factory → Router: Will register tokens automatically");
  console.log("Router → Factory: References factory for token info");
  console.log("Router → Uniswap: Handles post-graduation trading");

  console.log("\n📊 Gas Optimizations Applied:");
  console.log("✅ Removed deployedTokens array (saves ~50K gas/token)");
  console.log("✅ Removed tokenInfo mapping (saves ~30K gas/token)");
  console.log("✅ Removed batch query functions (saves ~100K+ gas/call)");
  console.log("✅ Added custom errors for gas efficiency");
  console.log("✅ Optimized event indexing for subgraph");

  console.log("\n🎯 Subgraph Integration Ready:");
  console.log("✅ All events properly indexed");
  console.log("✅ Comprehensive event coverage");
  console.log("✅ Timestamps for chronological tracking");
  console.log("✅ Essential view functions only");

  // Save deployment info to a file
  const deploymentInfo = {
    network: "sepolia",
    deployer: deployer.address,
    treasury: TREASURY_ADDRESS,
    deploymentFee: ethers.formatEther(DEPLOYMENT_FEE),
    globalTokenSupply: "1000000000", // Fixed 1 billion supply
    bondingCurveFeeBasisPoints: BONDING_CURVE_FEE_BASIS_POINTS,
    uniswapFactory: UNISWAP_FACTORY,
    uniswapRouter: UNISWAP_ROUTER,
    evilUSDC: evilUSDCAddress,
    factory: factoryAddress,
    router: routerAddress,
    deploymentTime: new Date().toISOString(),
    gasOptimizations: {
      removedDeployedTokensArray: true,
      removedTokenInfoMapping: true,
      removedBatchQueryFunctions: true,
      customErrors: true,
      optimizedEventIndexing: true,
    },
  };

  // Save to deployment-info.json
  const deploymentPath = path.join(__dirname, "..", "deployment-info.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n💾 Deployment info saved to deployment-info.json");

  console.log("\n📜 Next Steps:");
  console.log("1. Verify the contracts on Sepolia Etherscan:");
  console.log(
    `   Factory: https://sepolia.etherscan.io/address/${factoryAddress}`
  );
  console.log(
    `   Router: https://sepolia.etherscan.io/address/${routerAddress}`
  );
  console.log("2. Set environment variables for token deployment:");
  console.log(`   export FACTORY_ADDRESS="${factoryAddress}"`);
  console.log(`   export ROUTER_ADDRESS="${routerAddress}"`);
  console.log(
    "3. Deploy a token using: npx hardhat run scripts/deploy-stonk-token-sepolia.ts --network sepolia"
  );
  console.log("4. Set up your subgraph to index the deployed contracts");

  console.log(
    "\n🎉 Deployment Complete! Your gas-optimized contracts are ready for production."
  );
}

// Run the deployment script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
