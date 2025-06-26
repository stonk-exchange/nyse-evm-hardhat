import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ContractTransactionReceipt, EventLog } from "ethers";

describe("StonkTradingRouter", function () {
  let factory: any;
  let router: any;
  let stonkToken: any;
  let bondingCurve: any;
  let assetToken: any;
  let uniswapFactory: any;
  let uniswapRouter: any;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let treasury: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
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

  describe("Router Setup", function () {
    it("should be deployed with correct parameters", async function () {
      expect(await router.factory()).to.equal(await factory.getAddress());
      expect(await router.uniswapRouter()).to.equal(
        await uniswapRouter.getAddress()
      );
      expect(await router.uniswapFactory()).to.equal(
        await uniswapFactory.getAddress()
      );
      expect(await router.assetToken()).to.equal(await assetToken.getAddress());
    });

    it("should have owner set correctly", async function () {
      expect(await router.owner()).to.equal(owner.address);
    });
  });

  describe("Token Registration", function () {
    it("should register tokens when deployed through factory", async function () {
      // Deploy a token through factory
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
        (log: any): log is EventLog =>
          log instanceof EventLog && log.fragment?.name === "TokenDeployed"
      );

      if (!eventLog) throw new Error("TokenDeployed event not found");
      const [tokenAddress, bondingCurveAddress] = eventLog.args;

      // Check if token is registered in router
      const [graduated, bondingCurveAddr, uniswapPair] =
        await router.getTokenTradingState(tokenAddress);
      expect(graduated).to.be.false;
      expect(bondingCurveAddr).to.equal(bondingCurveAddress);
      expect(uniswapPair).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Bonding Curve Trading", function () {
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
        (log: any): log is EventLog =>
          log instanceof EventLog && log.fragment?.name === "TokenDeployed"
      );

      if (!eventLog) throw new Error("TokenDeployed event not found");
      [tokenAddress, bondingCurveAddress] = eventLog.args;

      stonkToken = await ethers.getContractAt("StonkToken", tokenAddress);
      bondingCurve = await ethers.getContractAt(
        "BondingCurve",
        bondingCurveAddress
      );

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

    it("should allow buying tokens through router", async function () {
      const buyAmount = ethers.parseEther("10");
      const maxAssetAmount = ethers.parseUnits("100", 6);
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes

      // Check bonding curve balances before purchase
      const bondingCurveTokenBalanceBefore = await stonkToken.balanceOf(
        bondingCurveAddress
      );
      const bondingCurveUSDCBalanceBefore = await assetToken.balanceOf(
        bondingCurveAddress
      );
      console.log(
        "Bonding curve BEFORE purchase - Tokens:",
        ethers.formatEther(bondingCurveTokenBalanceBefore),
        "USDC:",
        ethers.formatUnits(bondingCurveUSDCBalanceBefore, 6)
      );

      // Buy through router
      await router
        .connect(user1)
        .buyTokens(tokenAddress, buyAmount, maxAssetAmount, deadline);

      // Check bonding curve balances after purchase
      const bondingCurveTokenBalanceAfter = await stonkToken.balanceOf(
        bondingCurveAddress
      );
      const bondingCurveUSDCBalanceAfter = await assetToken.balanceOf(
        bondingCurveAddress
      );
      console.log(
        "Bonding curve AFTER purchase - Tokens:",
        ethers.formatEther(bondingCurveTokenBalanceAfter),
        "USDC:",
        ethers.formatUnits(bondingCurveUSDCBalanceAfter, 6)
      );

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

    it("should allow selling tokens through router", async function () {
      // First buy some tokens
      const buyAmount = ethers.parseEther("10");
      const maxAssetAmount = ethers.parseUnits("100", 6);
      const deadline = Math.floor(Date.now() / 1000) + 300;

      await router
        .connect(user1)
        .buyTokens(tokenAddress, buyAmount, maxAssetAmount, deadline);

      // Check bonding curve balances before sell
      const bondingCurveTokenBalanceBeforeSell = await stonkToken.balanceOf(
        bondingCurveAddress
      );
      const bondingCurveUSDCBalanceBeforeSell = await assetToken.balanceOf(
        bondingCurveAddress
      );
      console.log(
        "Bonding curve BEFORE sell - Tokens:",
        ethers.formatEther(bondingCurveTokenBalanceBeforeSell),
        "USDC:",
        ethers.formatUnits(bondingCurveUSDCBalanceBeforeSell, 6)
      );

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

      // Check bonding curve balances after sell
      const bondingCurveTokenBalanceAfterSell = await stonkToken.balanceOf(
        bondingCurveAddress
      );
      const bondingCurveUSDCBalanceAfterSell = await assetToken.balanceOf(
        bondingCurveAddress
      );
      console.log(
        "Bonding curve AFTER sell - Tokens:",
        ethers.formatEther(bondingCurveTokenBalanceAfterSell),
        "USDC:",
        ethers.formatUnits(bondingCurveUSDCBalanceAfterSell, 6)
      );

      // Verify tokens were sold
      const userTokenBalance = await stonkToken.balanceOf(user1.address);
      expect(userTokenBalance).to.equal(buyAmount - sellAmount);
    });

    it("should graduate token automatically when asset balance reaches threshold", async function () {
      // Get graduation threshold
      const graduationThreshold = await bondingCurve.getGraduationThreshold();
      console.log(
        "Graduation threshold:",
        ethers.formatUnits(graduationThreshold, 6),
        "USDC"
      );

      // Fund user with enough USDC to reach graduation threshold
      await assetToken.transfer(user1.address, ethers.parseUnits("200000", 6));
      await assetToken
        .connect(user1)
        .approve(await router.getAddress(), ethers.parseUnits("200000", 6));

      // Check initial graduation status
      const [initialGraduated, initialBondingCurve, initialPair] =
        await router.getTokenTradingState(tokenAddress);
      expect(initialGraduated).to.be.false;
      expect(initialBondingCurve).to.equal(bondingCurveAddress);

      // Buy enough tokens to accumulate asset balance above graduation threshold
      const buyAmount = ethers.parseEther("10000"); // Buy 10k tokens instead of 50k
      const maxAssetAmount = ethers.parseUnits("200000", 6); // Allow up to 200k USDC
      const deadline = Math.floor(Date.now() / 1000) + 300;

      // This should trigger graduation since it will put >100k USDC in bonding curve
      await router
        .connect(user1)
        .buyTokens(tokenAddress, buyAmount, maxAssetAmount, deadline);

      // Check if graduation happened by checking bonding curve status directly
      const bondingCurveGraduated = await bondingCurve.getGraduationStatus();
      expect(bondingCurveGraduated).to.be.true;

      // Check router's view of graduation status
      const [graduated, bondingCurveAddr, uniswapPair] =
        await router.getTokenTradingState(tokenAddress);
      expect(graduated).to.be.true;
      expect(bondingCurveAddr).to.equal(bondingCurveAddress);

      console.log("✅ Token graduated successfully!");
    });

    it("should create Uniswap pair and add liquidity after graduation", async function () {
      // First graduate the token
      const graduationThreshold = await bondingCurve.getGraduationThreshold();
      await assetToken.transfer(user1.address, ethers.parseUnits("200000", 6));
      await assetToken
        .connect(user1)
        .approve(await router.getAddress(), ethers.parseUnits("200000", 6));

      const buyAmount = ethers.parseEther("10000"); // Buy only 10k tokens instead of 50k
      const maxAssetAmount = ethers.parseUnits("200000", 6);
      const deadline = Math.floor(Date.now() / 1000) + 300;

      // Check bonding curve balances BEFORE any purchase (should have all tokens, no USDC)
      const bondingCurveTokenBalanceBefore = await stonkToken.balanceOf(
        bondingCurveAddress
      );
      const bondingCurveUSDCBalanceBefore = await assetToken.balanceOf(
        bondingCurveAddress
      );
      console.log(
        "Bonding curve token balance BEFORE any purchase:",
        ethers.formatEther(bondingCurveTokenBalanceBefore)
      );
      console.log(
        "Bonding curve USDC balance BEFORE any purchase:",
        ethers.formatUnits(bondingCurveUSDCBalanceBefore, 6)
      );

      // Check bonding curve token balance right before the purchase
      const bondingCurveTokenBalanceBeforePurchase = await stonkToken.balanceOf(
        bondingCurveAddress
      );
      console.log(
        "Bonding curve token balance right before purchase:",
        ethers.formatEther(bondingCurveTokenBalanceBeforePurchase)
      );

      // Make the purchase that will trigger graduation
      console.log(
        "Requesting to buy:",
        ethers.formatEther(buyAmount),
        "tokens"
      );

      // Check bonding curve balance right before the router call
      const bondingCurveTokenBalanceBeforeRouterCall =
        await stonkToken.balanceOf(bondingCurveAddress);
      console.log(
        "Bonding curve token balance right before router call:",
        ethers.formatEther(bondingCurveTokenBalanceBeforeRouterCall)
      );

      await router
        .connect(user1)
        .buyTokens(tokenAddress, buyAmount, maxAssetAmount, deadline);

      // Check bonding curve balance right after the router call
      const bondingCurveTokenBalanceAfterRouterCall =
        await stonkToken.balanceOf(bondingCurveAddress);
      console.log(
        "Bonding curve token balance right after router call:",
        ethers.formatEther(bondingCurveTokenBalanceAfterRouterCall)
      );

      // Check what the user actually received
      const userTokenBalanceAfterPurchase = await stonkToken.balanceOf(
        user1.address
      );
      console.log(
        "User token balance after purchase:",
        ethers.formatEther(userTokenBalanceAfterPurchase)
      );

      // Check bonding curve balances RIGHT AFTER purchase but BEFORE graduation check
      const bondingCurveTokenBalanceAfterPurchase = await stonkToken.balanceOf(
        bondingCurveAddress
      );
      const bondingCurveUSDCBalanceAfterPurchase = await assetToken.balanceOf(
        bondingCurveAddress
      );
      console.log(
        "Bonding curve token balance AFTER purchase (before graduation):",
        ethers.formatEther(bondingCurveTokenBalanceAfterPurchase)
      );
      console.log(
        "Bonding curve USDC balance AFTER purchase (before graduation):",
        ethers.formatUnits(bondingCurveUSDCBalanceAfterPurchase, 6)
      );

      // Verify graduation
      const bondingCurveGraduated = await bondingCurve.getGraduationStatus();
      expect(bondingCurveGraduated).to.be.true;

      // Check bonding curve balances AFTER graduation (should be empty)
      const bondingCurveTokenBalanceAfter = await stonkToken.balanceOf(
        bondingCurveAddress
      );
      const bondingCurveUSDCBalanceAfter = await assetToken.balanceOf(
        bondingCurveAddress
      );
      console.log(
        "Bonding curve token balance AFTER graduation:",
        ethers.formatEther(bondingCurveTokenBalanceAfter)
      );
      console.log(
        "Bonding curve USDC balance AFTER graduation:",
        ethers.formatUnits(bondingCurveUSDCBalanceAfter, 6)
      );

      // Check that Uniswap pair was created
      const pairAddress = await uniswapFactory.getPair(
        tokenAddress,
        await assetToken.getAddress()
      );
      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
      console.log("✅ Uniswap pair created at:", pairAddress);

      // Get the pair contract
      const pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);

      // Check the pair's token and USDC balances directly
      const pairTokenBalance = await stonkToken.balanceOf(pairAddress);
      const pairUSDCBalance = await assetToken.balanceOf(pairAddress);
      console.log(
        "Uniswap pair token balance:",
        ethers.formatEther(pairTokenBalance)
      );
      console.log(
        "Uniswap pair USDC balance:",
        ethers.formatUnits(pairUSDCBalance, 6)
      );

      // Check that pair has liquidity (reserves > 0)
      const reserves = await pair.getReserves();
      console.log(
        "Uniswap reserves - Token0:",
        ethers.formatEther(reserves[0])
      );
      console.log(
        "Uniswap reserves - Token1:",
        ethers.formatUnits(reserves[1], 6)
      );

      // Determine which token is token0 and which is token1
      const token0Address = await pair.token0();
      const token1Address = await pair.token1();

      let tokenReserves, usdcReserves;
      if (token0Address.toLowerCase() === tokenAddress.toLowerCase()) {
        tokenReserves = reserves[0];
        usdcReserves = reserves[1];
      } else {
        tokenReserves = reserves[1];
        usdcReserves = reserves[0];
      }

      expect(tokenReserves).to.be.gt(0);
      expect(usdcReserves).to.be.gt(0);
      console.log(
        "✅ Uniswap pair has liquidity - Tokens:",
        ethers.formatEther(tokenReserves),
        "USDC:",
        ethers.formatUnits(usdcReserves, 6)
      );

      // Check that bonding curve has no tokens left (they were moved to Uniswap)
      const bondingCurveTokenBalance = await stonkToken.balanceOf(
        bondingCurveAddress
      );
      const bondingCurveUSDCBalance = await assetToken.balanceOf(
        bondingCurveAddress
      );
      console.log(
        "Bonding curve token balance after graduation:",
        ethers.formatEther(bondingCurveTokenBalance)
      );
      console.log(
        "Bonding curve USDC balance after graduation:",
        ethers.formatUnits(bondingCurveUSDCBalance, 6)
      );

      // Bonding curve should have minimal or no tokens/USDC left after graduation
      expect(bondingCurveTokenBalance).to.be.lte(ethers.parseEther("1")); // Allow for small dust amounts
      expect(bondingCurveUSDCBalance).to.be.lte(ethers.parseUnits("1", 6)); // Allow for small dust amounts
      console.log("✅ Bonding curve assets moved to Uniswap");
    });

    it("should allow trading through Uniswap after graduation", async function () {
      // First graduate the token
      const graduationThreshold = await bondingCurve.getGraduationThreshold();
      await assetToken.transfer(user1.address, ethers.parseUnits("200000", 6));
      await assetToken
        .connect(user1)
        .approve(await router.getAddress(), ethers.parseUnits("200000", 6));

      const buyAmount = ethers.parseEther("10000"); // Buy 10k tokens instead of 50k
      const maxAssetAmount = ethers.parseUnits("200000", 6);
      const deadline = Math.floor(Date.now() / 1000) + 300;

      await router
        .connect(user1)
        .buyTokens(tokenAddress, buyAmount, maxAssetAmount, deadline);

      // Verify graduation
      const bondingCurveGraduated = await bondingCurve.getGraduationStatus();
      expect(bondingCurveGraduated).to.be.true;

      // Check that router shows graduated status
      const [graduated, bondingCurveAddr, uniswapPair] =
        await router.getTokenTradingState(tokenAddress);
      expect(graduated).to.be.true;

      // Verify Uniswap pair exists and has liquidity
      const pairAddress = await uniswapFactory.getPair(
        tokenAddress,
        await assetToken.getAddress()
      );
      expect(pairAddress).to.not.equal(ethers.ZeroAddress);

      const pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);
      const reserves = await pair.getReserves();
      expect(reserves[0]).to.be.gt(0);
      expect(reserves[1]).to.be.gt(0);

      // Check user balances and approvals before Uniswap trading
      const userUSDCBalance = await assetToken.balanceOf(user1.address);
      const userTokenBalance = await stonkToken.balanceOf(user1.address);
      const routerUSDCAllowance = await assetToken.allowance(
        user1.address,
        await router.getAddress()
      );
      const routerTokenAllowance = await stonkToken.allowance(
        user1.address,
        await router.getAddress()
      );

      console.log("User USDC balance:", ethers.formatUnits(userUSDCBalance, 6));
      console.log("User token balance:", ethers.formatEther(userTokenBalance));
      console.log(
        "Router USDC allowance:",
        ethers.formatUnits(routerUSDCAllowance, 6)
      );
      console.log(
        "Router token allowance:",
        ethers.formatUnits(routerTokenAllowance, 18)
      );

      // Ensure user has enough USDC and router has allowance
      expect(userUSDCBalance).to.be.gt(ethers.parseUnits("10", 6));
      expect(routerUSDCAllowance).to.be.gt(ethers.parseUnits("10", 6));

      // Try to buy more tokens - should work through Uniswap now
      const additionalBuyAmount = ethers.parseEther("10");
      const additionalMaxAssetAmount = ethers.parseUnits("1000", 6); // Higher max to avoid slippage

      // Get user's current token balance
      const initialTokenBalance = await stonkToken.balanceOf(user1.address);

      await router
        .connect(user1)
        .buyTokens(
          tokenAddress,
          additionalBuyAmount,
          additionalMaxAssetAmount,
          deadline
        );

      // Verify tokens were received (trading through Uniswap)
      const finalTokenBalance = await stonkToken.balanceOf(user1.address);
      expect(finalTokenBalance).to.be.gt(initialTokenBalance);
      console.log(
        "✅ Uniswap buy successful - Tokens received:",
        ethers.formatEther(finalTokenBalance - initialTokenBalance)
      );

      // Try to sell tokens - should work through Uniswap
      const sellAmount = ethers.parseEther("5");
      await stonkToken
        .connect(user1)
        .approve(await router.getAddress(), sellAmount);

      // Get user's current USDC balance
      const initialUSDCBalance = await assetToken.balanceOf(user1.address);

      await router.connect(user1).sellTokens(
        tokenAddress,
        sellAmount,
        ethers.parseUnits("1", 6), // min 1 USDC
        deadline
      );

      // Verify USDC was received (trading through Uniswap)
      const finalUSDCBalance = await assetToken.balanceOf(user1.address);
      expect(finalUSDCBalance).to.be.gt(initialUSDCBalance);
      console.log(
        "✅ Uniswap sell successful - USDC received:",
        ethers.formatUnits(finalUSDCBalance - initialUSDCBalance, 6)
      );
    });
  });

  // Access Control tests removed - graduation functions have been removed
});
