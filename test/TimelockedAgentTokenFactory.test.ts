import { expect } from "chai";
import { ethers } from "hardhat";

describe("TimelockedAgentTokenFactory", function () {
  let factory: any;
  let deployer: any;
  let treasury: any;
  let user1: any;

  const INITIAL_FEE = ethers.parseEther("0.01"); // 0.01 ETH

  before(async function () {
    [deployer, treasury, user1] = await ethers.getSigners();

    // Deploy factory with treasury and initial fee
    const FactoryContract = await ethers.getContractFactory(
      "TimelockedAgentTokenFactory"
    );
    factory = await FactoryContract.deploy(treasury.address, INITIAL_FEE);
    await factory.waitForDeployment();
  });

  it("should set treasury and fee price correctly", async function () {
    expect(await factory.treasury()).to.equal(treasury.address);
    expect(await factory.feePrice()).to.equal(INITIAL_FEE);
    expect(await factory.owner()).to.equal(deployer.address);
  });

  it("should allow owner to change fee price", async function () {
    const newFee = ethers.parseEther("0.02");

    await expect(factory.setFeePrice(newFee))
      .to.emit(factory, "FeePriceUpdated")
      .withArgs(INITIAL_FEE, newFee);

    expect(await factory.feePrice()).to.equal(newFee);

    // Reset for other tests
    await factory.setFeePrice(INITIAL_FEE);
  });

  it("should not allow non-owner to change fee price", async function () {
    const newFee = ethers.parseEther("0.05");

    await expect(
      factory.connect(user1).setFeePrice(newFee)
    ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
  });

  it("should deploy token and send fee to treasury", async function () {
    const treasuryBalanceBefore = await ethers.provider.getBalance(
      treasury.address
    );

    const tx = await factory.connect(user1).deployToken(
      "STONK",
      "STONK",
      ethers.parseEther("1000000"),
      user1.address, // vault
      user1.address, // tax recipient
      300, // buy tax
      500, // sell tax
      50, // swap threshold
      { value: INITIAL_FEE }
    );

    const receipt = await tx.wait();

    // Check treasury received the fee
    const treasuryBalanceAfter = await ethers.provider.getBalance(
      treasury.address
    );
    expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(INITIAL_FEE);

    // Check event was emitted
    expect(receipt.logs.length).to.be.greaterThan(0);
  });

  it("should fail if insufficient fee sent", async function () {
    await expect(
      factory.connect(user1).deployToken(
        "FAIL",
        "FAIL",
        ethers.parseEther("1000"),
        user1.address,
        user1.address,
        0,
        0,
        0,
        { value: ethers.parseEther("0.005") } // Too low
      )
    ).to.be.revertedWith("Insufficient fee");
  });
});
