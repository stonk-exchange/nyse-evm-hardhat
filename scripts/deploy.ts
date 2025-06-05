import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log(
    "Account balance:",
    (await deployer.provider.getBalance(deployer.address)).toString()
  );

  // Deploy the TimelockedAgentToken
  const TimelockedAgentToken = await ethers.getContractFactory(
    "TimelockedAgentToken"
  );

  // Tax parameters
  const taxParams = {
    projectBuyTaxBasisPoints: 300, // 3%
    projectSellTaxBasisPoints: 500, // 5%
    taxSwapThresholdBasisPoints: 50, // 0.5%
    projectTaxRecipient: deployer.address,
  };

  const token = await TimelockedAgentToken.deploy(
    deployer.address, // owner
    "NYSE Stock Token", // name
    "NYSE", // symbol
    ethers.parseEther("1000000"), // total supply (1M tokens)
    deployer.address, // vault (where tokens are initially minted)
    taxParams
  );

  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  console.log("TimelockedAgentToken deployed to:", tokenAddress);
  console.log("Token name:", await token.name());
  console.log("Token symbol:", await token.symbol());
  console.log("Total supply:", ethers.formatEther(await token.totalSupply()));
  console.log("Market state:", await token.getMarketState());
  console.log("Is market open:", await token.isMarketOpen());

  // Add deployer as timelock exemption for testing
  await token.addTimelockExemption(deployer.address);
  console.log("Added deployer as timelock exemption");

  return {
    token: tokenAddress,
    deployer: deployer.address,
  };
}

main()
  .then((result) => {
    console.log("Deployment successful:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
