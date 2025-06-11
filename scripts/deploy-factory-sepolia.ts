import { ethers } from "hardhat";
import { TimelockedAgentTokenFactory } from "../typechain-types";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("🚀 Deploying TimelockedAgentTokenFactory to Sepolia Testnet");
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

  // Deploy the factory contract
  console.log("\n📦 Deploying TimelockedAgentTokenFactory...");
  const TimelockedAgentTokenFactory = await ethers.getContractFactory(
    "TimelockedAgentTokenFactory"
  );
  const factoryInstance = await TimelockedAgentTokenFactory.deploy();

  await factoryInstance.deployed();

  console.log("\n✅ TimelockedAgentTokenFactory deployed successfully!");
  console.log("Contract Address:", factoryInstance.address);

  console.log("\n📜 Saving deployment details...");
  console.log(
    "You can verify the contract on Sepolia using the address above."
  );
}

// Run the deployment script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
