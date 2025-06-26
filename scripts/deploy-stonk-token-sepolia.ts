import { ethers } from "hardhat";
import { EventLog } from "ethers";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("🚀 Deploying AAPL Token to Sepolia Testnet");
  console.log("=====================================");
  console.log("Deploying with the account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await deployer.provider.getBalance(deployer.address)),
    "ETH"
  );

  // Check if we have enough ETH for deployment
  const balance = await deployer.provider.getBalance(deployer.address);
  if (balance < ethers.parseEther("0.2")) {
    // Need more ETH for token deployment
    console.error(
      "❌ Insufficient ETH balance for deployment. Need at least 0.2 ETH"
    );
    console.error("Get Sepolia ETH from: https://sepoliafaucet.com/");
    process.exit(1);
  }

  // Get the factory address from command line argument
  const factoryAddress = process.env.FACTORY_ADDRESS;
  if (!factoryAddress) {
    console.error("❌ Please provide FACTORY_ADDRESS environment variable");
    process.exit(1);
  }

  // Connect to the factory
  const factory = await ethers.getContractAt(
    "StonkTokenFactory",
    factoryAddress
  );

  // Verify factory contract state
  console.log("\n🔍 Verifying factory contract state...");
  const treasury = await factory.treasury();
  const feePrice = await factory.feePrice();
  const uniswapFactory = await factory.uniswapFactory();
  const uniswapRouter = await factory.uniswapRouter();
  const assetToken = await factory.assetToken();
  const globalTokenSupply = await factory.globalTokenSupply();
  const bondingCurveFeeBasisPoints = await factory.bondingCurveFeeBasisPoints();

  console.log("Factory Configuration:");
  console.log("- Treasury:", treasury);
  console.log("- Fee Price:", ethers.formatEther(feePrice), "ETH");
  console.log("- Global Token Supply:", ethers.formatEther(globalTokenSupply));
  console.log(
    "- Bonding Curve Fee:",
    bondingCurveFeeBasisPoints,
    "basis points"
  );
  console.log("- Uniswap Factory:", uniswapFactory);
  console.log("- Uniswap Router:", uniswapRouter);
  console.log("- Asset Token:", assetToken);

  // Token parameters
  const name = "Apple Stock Token";
  const symbol = "AAPL";
  const projectTaxRecipient = deployer.address; // You can change this
  const projectBuyTaxBasisPoints = 500; // 5%
  const projectSellTaxBasisPoints = 500; // 5%
  const taxSwapThresholdBasisPoints = 1000; // 10%

  // Get deployment fee
  const deploymentFee = await factory.feePrice();

  console.log("\n📦 Deploying AAPL Token...");
  console.log("Token Parameters:");
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log(
    "Total Supply:",
    ethers.formatEther(globalTokenSupply),
    "(from factory)"
  );
  console.log("Project Tax Recipient:", projectTaxRecipient);
  console.log("Buy Tax:", projectBuyTaxBasisPoints / 100, "%");
  console.log("Sell Tax:", projectSellTaxBasisPoints / 100, "%");
  console.log("Swap Threshold:", taxSwapThresholdBasisPoints / 100, "%");
  console.log("Deployment Fee:", ethers.formatEther(deploymentFee), "ETH");

  // Deploy the token (updated function signature)
  const tx = await factory.deployToken(
    name,
    symbol,
    projectTaxRecipient,
    projectBuyTaxBasisPoints,
    projectSellTaxBasisPoints,
    taxSwapThresholdBasisPoints,
    { value: deploymentFee }
  );

  console.log("\n⏳ Waiting for deployment transaction...");
  const receipt = await tx.wait();

  // Find the TokenDeployed event
  const eventLog = receipt?.logs.find(
    (log: any): log is EventLog =>
      log instanceof EventLog && log.fragment?.name === "TokenDeployed"
  );

  if (!eventLog) {
    console.error("❌ TokenDeployed event not found");
    process.exit(1);
  }

  const [tokenAddress, bondingCurveAddress] = eventLog.args;

  console.log("\n✅ AAPL Token deployed successfully!");
  console.log("Token Address:", tokenAddress);
  console.log("Bonding Curve Address:", bondingCurveAddress);

  console.log("\n📜 Next steps:");
  console.log("1. Verify the contracts on Sepolia Etherscan");
  console.log("2. Use the buy-tokens.ts script to purchase tokens");
  console.log("3. Use the sell-tokens.ts script to sell tokens");
  console.log("\n📋 Environment variables for trading:");
  console.log(`export ROUTER_ADDRESS="0x..."`);
  console.log(`export TOKEN_ADDRESS="${tokenAddress}"`);
  console.log(`export EVILUSDC_ADDRESS="${assetToken}"`);
  console.log(`export AMOUNT="1000"`);
}

// Run the deployment script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
