import { ethers } from "hardhat";
import { StonkTokenFactory__factory } from "../typechain-types";
import { EventLog } from "ethers";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("🚀 Deploying StonkToken to Sepolia Testnet");
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

  // Connect to the factory using typechain factory
  const factory = StonkTokenFactory__factory.connect(factoryAddress, deployer);

  // Token parameters
  const name = "Test Stonk Token";
  const symbol = "TST";
  const totalSupply = ethers.parseEther("1000000"); // 1M tokens
  const projectTaxRecipient = deployer.address; // You can change this
  const projectBuyTaxBasisPoints = 500; // 5%
  const projectSellTaxBasisPoints = 500; // 5%
  const taxSwapThresholdBasisPoints = 1000; // 10%

  // Get deployment fee
  const deploymentFee = await factory.feePrice();

  console.log("\n📦 Deploying StonkToken...");
  console.log("Token Parameters:");
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("Total Supply:", ethers.formatEther(totalSupply));
  console.log("Project Tax Recipient:", projectTaxRecipient);
  console.log("Buy Tax:", projectBuyTaxBasisPoints / 100, "%");
  console.log("Sell Tax:", projectSellTaxBasisPoints / 100, "%");
  console.log("Swap Threshold:", taxSwapThresholdBasisPoints / 100, "%");
  console.log("Deployment Fee:", ethers.formatEther(deploymentFee), "ETH");

  // Deploy the token
  const tx = await factory.deployToken(
    name,
    symbol,
    totalSupply,
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
    (log): log is EventLog =>
      log instanceof EventLog && log.fragment?.name === "TokenDeployed"
  );

  if (!eventLog) {
    console.error("❌ TokenDeployed event not found");
    process.exit(1);
  }

  const [tokenAddress, bondingCurveAddress] = eventLog.args;

  console.log("\n✅ StonkToken deployed successfully!");
  console.log("Token Address:", tokenAddress);
  console.log("Bonding Curve Address:", bondingCurveAddress);

  console.log("\n📜 Next steps:");
  console.log("1. Verify the contracts on Sepolia Etherscan");
  console.log("2. Fund the bonding curve with initial liquidity");
  console.log("3. Test buying and selling tokens");
}

// Run the deployment script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
