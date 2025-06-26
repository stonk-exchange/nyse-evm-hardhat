import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  StonkTokenFactory,
  StonkToken,
  BondingCurve,
  StonkTradingRouter,
  MockERC20,
  MockUniswapFactory,
  MockUniswapRouter,
  StonkToken__factory,
  BondingCurve__factory,
  StonkTradingRouter__factory,
} from "../typechain-types";
import { ContractTransactionReceipt, EventLog } from "ethers";

describe("StonkTokenFactory with TradingRouter", function () {
  let factory: StonkTokenFactory;
  let router: StonkTradingRouter;
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
  const GLOBAL_TOKEN_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
  const BONDING_CURVE_FEE_BASIS_POINTS = 300; // 3% fee

  beforeEach(async function () {
    [owner, user1, user2, treasury] = await ethers.getSigners();

    // Deploy mock USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    assetToken = await MockERC20.deploy("Mock USDC", "USDC", 6);
    // Mint more USDC to owner for testing
    await assetToken.mint(owner.address, ethers.parseUnits("10000000", 6)); // 10M USDC

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
      await assetToken.getAddress(),
      GLOBAL_TOKEN_SUPPLY,
      BONDING_CURVE_FEE_BASIS_POINTS
    );

    // Deploy StonkTradingRouter
    const StonkTradingRouter = await ethers.getContractFactory(
      "StonkTradingRouter"
    );
    router = await StonkTradingRouter.deploy(
      await factory.getAddress(),
      await uniswapRouter.getAddress(),
      await uniswapFactory.getAddress(),
      await assetToken.getAddress()
    );

    // Set the trading router in the factory
    await factory.setTradingRouter(await router.getAddress());
  });

  describe("Token Deployment", function () {
    it("should deploy token correctly", async function () {
      const tx = await factory.deployToken(
        "Test Token",
        "TEST",
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
      let bondingCurveAddress: string;
      if (eventLog) {
        [tokenAddress, bondingCurveAddress] = eventLog.args;
      } else {
        throw new Error("TokenDeployed event not found");
      }

      // Get token instance using typechain factory
      const token = StonkToken__factory.connect(tokenAddress, owner);
      const bondingCurve = BondingCurve__factory.connect(
        bondingCurveAddress,
        owner
      );

      // Verify token info
      expect(await token.name()).to.equal("Test Token");
      expect(await token.symbol()).to.equal("TEST");
      expect(await token.totalSupply()).to.equal(GLOBAL_TOKEN_SUPPLY);
      expect(await token.owner()).to.equal(owner.address);

      // Check initial price
      const initialPrice = await bondingCurve.getCurrentPrice();
      console.log("Initial token price:", ethers.formatEther(initialPrice));
    });

    it("should require correct fee amount", async function () {
      await expect(
        factory.deployToken(
          "Test Token",
          "TEST",
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
      const initialBalance = await ethers.provider.getBalance(owner.address);

      const tx = await factory.deployToken(
        "Test Token",
        "TEST",
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
      expect(balanceAfter).to.equal(initialBalance - gasCost - DEPLOYMENT_FEE);
    });
  });

  describe("TradingRouter Operations", function () {
    let tokenAddress: string;
    let bondingCurveAddress: string;

    beforeEach(async function () {
      // Deploy a token first
      const tx = await factory.deployToken(
        "Test Token",
        "TEST",
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
      [tokenAddress, bondingCurveAddress] = eventLog.args;

      stonkToken = StonkToken__factory.connect(tokenAddress, owner);
      bondingCurve = BondingCurve__factory.connect(bondingCurveAddress, owner);

      // Fund user1 with USDC
      await assetToken.transfer(user1.address, ethers.parseUnits("100000", 6));
      await assetToken
        .connect(user1)
        .approve(await router.getAddress(), ethers.parseUnits("100000", 6));

      // Also approve router for token spending (for selling)
      await stonkToken
        .connect(user1)
        .approve(await router.getAddress(), ethers.parseEther("1000000"));

      // Approve router to spend bonding curve's tokens and USDC
      await stonkToken
        .connect(bondingCurve.runner)
        .approve(await router.getAddress(), ethers.parseEther("1000000"));
      await assetToken
        .connect(bondingCurve.runner)
        .approve(await router.getAddress(), ethers.parseUnits("1000000", 6));
    });

    it("should allow buying tokens through router (bonding curve phase)", async function () {
      const buyAmount = ethers.parseEther("10");
      const maxAssetAmount = ethers.parseUnits("100", 6);
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes

      // Check initial trading state
      const [graduated, bondingCurveAddr, uniswapPair] =
        await router.getTokenTradingState(tokenAddress);
      expect(graduated).to.be.false;
      expect(bondingCurveAddr).to.equal(bondingCurveAddress);
      expect(uniswapPair).to.equal(ethers.ZeroAddress);

      // Buy through router
      await router
        .connect(user1)
        .buyTokens(tokenAddress, buyAmount, maxAssetAmount, deadline);

      // Verify tokens were received
      const userBalance = await stonkToken.balanceOf(user1.address);
      expect(userBalance).to.equal(buyAmount);
    });

    it("should calculate buy price correctly", async function () {
      const buyAmount = ethers.parseEther("10");

      // Calculate price through router
      const routerPrice = await router.calculateBuyPrice(
        tokenAddress,
        buyAmount
      );

      // Calculate price directly through bonding curve
      const bondingCurvePrice = await bondingCurve.calculatePurchasePrice(
        buyAmount
      );

      expect(routerPrice).to.equal(bondingCurvePrice);
    });

    it("should calculate sell proceeds correctly", async function () {
      const sellAmount = ethers.parseEther("10");

      // Calculate proceeds through router
      const routerProceeds = await router.calculateSellProceeds(
        tokenAddress,
        sellAmount
      );

      // Calculate proceeds directly through bonding curve
      const bondingCurveProceeds = await bondingCurve.calculateSaleProceeds(
        sellAmount
      );

      expect(routerProceeds).to.equal(bondingCurveProceeds);
    });

    it("should allow selling tokens through router (bonding curve phase)", async function () {
      // First buy some tokens
      const buyAmount = ethers.parseEther("10");
      const maxAssetAmount = ethers.parseUnits("100", 6);
      const deadline = Math.floor(Date.now() / 1000) + 300;

      await router
        .connect(user1)
        .buyTokens(tokenAddress, buyAmount, maxAssetAmount, deadline);

      // Now sell some tokens
      const sellAmount = ethers.parseEther("5");
      // Calculate expected proceeds from bonding curve
      const expectedProceeds = await bondingCurve.calculateSaleProceeds(
        sellAmount
      );
      // Calculate fee
      const feeBasisPoints = await bondingCurve.feeBasisPoints();
      const fee = (expectedProceeds * BigInt(feeBasisPoints)) / 10000n;
      const netProceeds = expectedProceeds - fee;
      // Set minAssetAmount to netProceeds minus a small buffer (e.g., 1 USDC)
      const minAssetAmount = netProceeds - ethers.parseUnits("1", 6);

      // Approve router to spend tokens
      await stonkToken
        .connect(user1)
        .approve(await router.getAddress(), sellAmount);

      await router
        .connect(user1)
        .sellTokens(tokenAddress, sellAmount, minAssetAmount, deadline);

      // Verify tokens were sold
      const userTokenBalance = await stonkToken.balanceOf(user1.address);
      expect(userTokenBalance).to.equal(buyAmount - sellAmount);
    });
  });
});
