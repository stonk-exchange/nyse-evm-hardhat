import { expect } from "chai";
import { ethers } from "hardhat";
import { TimelockedAgentTokenFactory } from "../typechain-types";

describe("TimelockedAgentTokenFactory", function () {
  let factory: any;
  let deployer: any;

  before(async function () {
    [deployer] = await ethers.getSigners();

    // Deploy the TimelockedAgentTokenFactory contract
    const FactoryContract = await ethers.getContractFactory(
      "TimelockedAgentTokenFactory"
    );
    factory = await FactoryContract.deploy();
    await factory.waitForDeployment();
  });

  it("should deploy the factory contract successfully", async function () {
    expect(await factory.getAddress()).to.be.properAddress;
  });

  it("should deploy a new TimelockedAgentToken through the factory", async function () {
    const name = "Test Token";
    const symbol = "TTKN";
    const initialSupply = ethers.parseEther("1000000"); // 1M tokens
    const projectTaxRecipient = deployer.address;
    const fundedDate = 1693440000; // Example timestamp
    const projectBuyTaxBasisPoints = 300; // 3%
    const projectSellTaxBasisPoints = 500; // 5%
    const swapThresholdBasisPoints = 50; // 0.5%

    // Deploy a new token using the factory
    const tx = await factory.deployToken(
      name,
      symbol,
      initialSupply,
      deployer.address, // owner
      projectTaxRecipient,
      fundedDate,
      projectBuyTaxBasisPoints,
      projectSellTaxBasisPoints,
      swapThresholdBasisPoints
    );
    const receipt = await tx.wait();
    const event = receipt.events?.find((e: any) => e.event === "TokenDeployed");
    const tokenAddress = event?.args?.tokenAddress;

    expect(tokenAddress).to.be.properAddress;

    // Verify the deployed token's properties
    const token = await ethers.getContractAt(
      "TimelockedAgentToken",
      tokenAddress
    );
    expect(await token.name()).to.equal(name);
    expect(await token.symbol()).to.equal(symbol);
    expect(await token.totalSupply()).to.equal(initialSupply);
    expect(await token.projectTaxRecipient()).to.equal(projectTaxRecipient);
  });

  it("should return the correct count of deployed tokens", async function () {
    const count = await factory.getDeployedTokensCount();
    expect(count).to.equal(1); // Only one token deployed so far
  });

  it("should return the correct deployed token address by index", async function () {
    const tokenAddress = await factory.getDeployedToken(0);
    expect(tokenAddress).to.be.properAddress;
  });

  it("should revert when accessing an invalid token index", async function () {
    await expect(factory.getDeployedToken(999)).to.be.revertedWith(
      "Index out of bounds"
    );
  });
});
