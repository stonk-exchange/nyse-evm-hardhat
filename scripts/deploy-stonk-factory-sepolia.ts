import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("🚀 Deploying StonkTokenFactory to Sepolia Testnet");
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

  // Sepolia addresses
  const UNISWAP_FACTORY = "0x7E0987E5b3a30e3f2828572Bb659A548460a3003";
  const UNISWAP_ROUTER = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
  const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const TREASURY_ADDRESS = deployer.address; // You can change this to your treasury address
  const DEPLOYMENT_FEE = ethers.parseEther("0.1"); // 0.1 ETH deployment fee

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
    USDC_ADDRESS
  );

  await factoryInstance.waitForDeployment();

  console.log("\n✅ StonkTokenFactory deployed successfully!");
  console.log("Contract Address:", await factoryInstance.getAddress());

  console.log("\n📜 Deployment Parameters:");
  console.log("Treasury Address:", TREASURY_ADDRESS);
  console.log("Deployment Fee:", ethers.formatEther(DEPLOYMENT_FEE), "ETH");
  console.log("Uniswap Factory:", UNISWAP_FACTORY);
  console.log("Uniswap Router:", UNISWAP_ROUTER);
  console.log("USDC Address:", USDC_ADDRESS);

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
