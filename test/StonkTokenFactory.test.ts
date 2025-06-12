import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  StonkTokenFactory,
  StonkToken,
  BondingCurve,
  MockERC20,
  MockUniswapFactory,
  MockUniswapRouter,
  StonkToken__factory,
  BondingCurve__factory,
} from "../typechain-types";
import { ContractTransactionReceipt, EventLog } from "ethers";

describe("StonkTokenFactory", function () {
  let factory: StonkTokenFactory;
  let stonkToken: StonkToken;
  let bondingCurve: BondingCurve;
  let assetToken: MockERC20;
  let uniswapFactory: MockUniswapFactory;
  let uniswapRouter: MockUniswapRouter;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let treasury: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
  const GRADUATION_THRESHOLD = ethers.parseUnits("100000", 6); // 100k USDC
  const DEPLOYMENT_FEE = ethers.parseEther("0.1"); // 0.1 ETH

  beforeEach(async function () {
    [owner, user1, user2, treasury] = await ethers.getSigners();

    // Deploy mock USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    assetToken = await MockERC20.deploy("Mock USDC", "USDC", 6);
    await assetToken.mint(owner.address, ethers.parseUnits("1000000", 6));

    // Deploy mock Uniswap Factory
    const MockUniswapFactory = await ethers.getContractFactory(
      "MockUniswapFactory"
    );
    uniswapFactory = await MockUniswapFactory.deploy();

    // Deploy mock Uniswap Router
    const MockUniswapRouter = await ethers.getContractFactory(
      "MockUniswapRouter"
    );
    uniswapRouter = await MockUniswapRouter.deploy(
      await uniswapFactory.getAddress()
    );

    // Deploy StonkTokenFactory
    const StonkTokenFactory = await ethers.getContractFactory(
      "StonkTokenFactory"
    );
    factory = await StonkTokenFactory.deploy(
      treasury.address,
      DEPLOYMENT_FEE,
      await uniswapFactory.getAddress(),
      await uniswapRouter.getAddress(),
      await assetToken.getAddress()
    );
  });

  describe("Token Deployment", function () {
    it("should deploy token correctly", async function () {
      const tx = await factory.deployToken(
        "Test Token",
        "TEST",
        ethers.parseEther("1000000"), // 1M tokens
        treasury.address,
        500, // 5% buy tax
        500, // 5% sell tax
        1000, // 10% swap threshold
        { value: DEPLOYMENT_FEE }
      );

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction receipt is null");
      const eventLog = receipt.logs.find(
        (log): log is EventLog =>
          log instanceof EventLog && log.fragment?.name === "TokenDeployed"
      );

      expect(eventLog).to.not.be.undefined;
      let tokenAddress: string;
      if (eventLog) {
        [tokenAddress] = eventLog.args;
      } else {
        throw new Error("TokenDeployed event not found");
      }

      // Get token instance using typechain factory
      const token = StonkToken__factory.connect(tokenAddress, owner);

      // Verify token info
      expect(await token.name()).to.equal("Test Token");
      expect(await token.symbol()).to.equal("TEST");
      expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000"));
      expect(await token.owner()).to.equal(owner.address);
    });

    it("should require correct fee amount", async function () {
      await expect(
        factory.deployToken(
          "Test Token",
          "TEST",
          ethers.parseEther("1000000"),
          treasury.address,
          500,
          500,
          1000,
          { value: ethers.parseEther("0.05") } // Less than required fee
        )
      ).to.be.revertedWith("Insufficient fee");
    });

    it("should refund excess fee", async function () {
      const excessFee = ethers.parseEther("0.05");
      const tx = await factory.deployToken(
        "Test Token",
        "TEST",
        ethers.parseEther("1000000"),
        treasury.address,
        500,
        500,
        1000,
        { value: DEPLOYMENT_FEE + excessFee }
      );

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction receipt is null");
      const balanceAfter = await ethers.provider.getBalance(owner.address);
      const gasUsed = receipt.gasUsed || 0n;
      const gasPrice = tx.gasPrice || 0n;
      const gasCost = gasUsed * gasPrice;

      // Initial balance - gas cost - deployment fee should equal final balance
      expect(balanceAfter).to.equal(
        (await ethers.provider.getBalance(owner.address)) -
          gasCost -
          DEPLOYMENT_FEE
      );
    });
  });

  describe("Bonding Curve Operations", function () {
    beforeEach(async function () {
      // Deploy a token first
      const tx = await factory.deployToken(
        "Test Token",
        "TEST",
        INITIAL_SUPPLY,
        treasury.address,
        500,
        500,
        1000,
        { value: DEPLOYMENT_FEE }
      );

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction receipt is null");
      const eventLog = receipt.logs.find(
        (log): log is EventLog =>
          log instanceof EventLog && log.fragment?.name === "TokenDeployed"
      );

      if (!eventLog) throw new Error("TokenDeployed event not found");
      const [tokenAddress, bondingCurveAddress] = eventLog.args;

      stonkToken = StonkToken__factory.connect(tokenAddress, owner);
      bondingCurve = BondingCurve__factory.connect(bondingCurveAddress, owner);

      // Fund user1 with USDC
      await assetToken.transfer(user1.address, ethers.parseUnits("100000", 6));
      await assetToken
        .connect(user1)
        .approve(
          await bondingCurve.getAddress(),
          ethers.parseUnits("100000", 6)
        );
    });

    it("should allow buying tokens through bonding curve", async function () {
      const buyAmount = ethers.parseEther("1000");
      const maxAssetAmount = ethers.parseUnits("100000", 6);

      await bondingCurve.connect(user1).buyTokens(buyAmount, maxAssetAmount);

      expect(await stonkToken.balanceOf(user1.address)).to.equal(buyAmount);
    });

    it("should allow selling tokens through bonding curve", async function () {
      // First buy some tokens
      const buyAmount = ethers.parseEther("1000");
      const maxAssetAmount = ethers.parseUnits("100000", 6);
      await bondingCurve.connect(user1).buyTokens(buyAmount, maxAssetAmount);

      // Then sell half
      const sellAmount = buyAmount / 2n;
      const minAssetAmount = 0;
      await stonkToken
        .connect(user1)
        .approve(await bondingCurve.getAddress(), sellAmount);
      await bondingCurve.connect(user1).sellTokens(sellAmount, minAssetAmount);

      expect(await stonkToken.balanceOf(user1.address)).to.equal(
        buyAmount - sellAmount
      );
    });

    it("should graduate to Uniswap when threshold is reached", async function () {
      // Buy enough tokens to reach graduation threshold
      const buyAmount = ethers.parseEther("1000000");
      const maxAssetAmount = ethers.parseUnits("1000000", 6);
      await bondingCurve.connect(user1).buyTokens(buyAmount, maxAssetAmount);

      // Verify graduation
      const tokenInfo = await factory.getTokenInfo(
        await stonkToken.getAddress()
      );
      expect(tokenInfo.isGraduated).to.be.true;

      // Verify Uniswap pair was created
      const pair = await uniswapFactory.getPair(
        await stonkToken.getAddress(),
        await assetToken.getAddress()
      );
      expect(pair).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("Factory Admin Functions", function () {
    it("should allow owner to update fee price", async function () {
      const newFee = ethers.parseEther("0.2");
      await factory.setFeePrice(newFee);
      expect(await factory.feePrice()).to.equal(newFee);
    });

    it("should not allow non-owner to update fee price", async function () {
      const newFee = ethers.parseEther("0.2");
      await expect(
        factory.connect(user1).setFeePrice(newFee)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });
});
