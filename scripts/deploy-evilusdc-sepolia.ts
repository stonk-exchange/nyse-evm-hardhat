import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("🚀 Deploying EVILUSDC to Sepolia Testnet");
  console.log("=====================================");
  console.log("Deploying with the account:", deployer.address);

  // Deploy EVILUSDC
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const evilUSDC = await MockERC20.deploy("EVILUSDC", "EVILUSDC", 6);
  await evilUSDC.waitForDeployment();

  // Mint a large amount to the deployer
  const mintAmount = ethers.parseUnits("100000000", 6); // 100M EVILUSDC
  await evilUSDC.mint(deployer.address, mintAmount);

  console.log("\n✅ EVILUSDC deployed successfully!");
  console.log("Contract Address:", await evilUSDC.getAddress());
  console.log(
    "Minted",
    ethers.formatUnits(mintAmount, 6),
    "EVILUSDC to",
    deployer.address
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
