import { ethers } from "hardhat";
import {
  BondingCurve__factory,
  IERC20__factory,
  IUniswapV2Factory__factory,
  IUniswapV2Router02__factory,
  IUniswapV2Pair__factory,
} from "../typechain-types";

async function main() {
  const [user] = await ethers.getSigners();

  // Get addresses from environment variables
  const bondingCurveAddress = process.env.BONDING_CURVE_ADDRESS;
  const evilUSDCAddress = process.env.EVILUSDC_ADDRESS;
  const aaplTokenAddress = process.env.AAPL_TOKEN_ADDRESS;
  const uniswapRouterAddress = process.env.UNISWAP_ROUTER_ADDRESS;

  if (
    !bondingCurveAddress ||
    !evilUSDCAddress ||
    !aaplTokenAddress ||
    !uniswapRouterAddress
  ) {
    console.error("❌ Please provide all required environment variables:");
    console.error(
      "BONDING_CURVE_ADDRESS, EVILUSDC_ADDRESS, AAPL_TOKEN_ADDRESS, UNISWAP_ROUTER_ADDRESS"
    );
    process.exit(1);
  }

  // Connect to contracts
  const bondingCurve = BondingCurve__factory.connect(bondingCurveAddress, user);
  const evilUSDC = IERC20__factory.connect(evilUSDCAddress, user);
  const aaplToken = IERC20__factory.connect(aaplTokenAddress, user);
  const uniswapRouter = IUniswapV2Router02__factory.connect(
    uniswapRouterAddress,
    user
  );

  // Get current balances
  const evilUSDCBalance = await evilUSDC.balanceOf(user.address);
  const aaplBalance = await aaplToken.balanceOf(user.address);

  // Get bonding curve balances
  const curveEvilUSDCBalance = await evilUSDC.balanceOf(bondingCurveAddress);
  const curveAaplBalance = await aaplToken.balanceOf(bondingCurveAddress);

  // Get graduation status and threshold
  const graduationStatus = await bondingCurve.getGraduationStatus();
  const graduationThreshold = await bondingCurve.graduationThreshold();

  // Calculate graduation progress
  const graduationProgress =
    (Number(curveEvilUSDCBalance) / Number(graduationThreshold)) * 100;

  console.log("\n📊 Current State:");
  console.log("----------------------------------------");
  console.log("Your Balances:");
  console.log("EVILUSDC:", ethers.formatUnits(evilUSDCBalance, 6));
  console.log("AAPL:", ethers.formatEther(aaplBalance));
  console.log("\nBonding Curve Balances:");
  console.log("EVILUSDC:", ethers.formatUnits(curveEvilUSDCBalance, 6));
  console.log("AAPL:", ethers.formatEther(curveAaplBalance));
  console.log("\nGraduation Status:");
  console.log("Status:", graduationStatus ? "Graduated" : "Not Graduated");
  console.log(
    "Threshold:",
    ethers.formatUnits(graduationThreshold, 6),
    "EVILUSDC"
  );
  console.log("Progress:", graduationProgress.toFixed(2) + "%");

  // Only try to get current price if there are tokens in the curve
  if (curveAaplBalance > 0n) {
    try {
      const currentPrice = await bondingCurve.getCurrentPrice();
      console.log(
        "Current Price:",
        ethers.formatEther(currentPrice),
        "EVILUSDC per AAPL"
      );
    } catch (error) {
      console.log("Current Price: Not available (no tokens in curve)");
    }
  } else {
    console.log("Current Price: Not available (no tokens in curve)");
  }
  console.log("----------------------------------------");

  // Check if amount was provided
  const amount = process.env.AMOUNT;
  if (!amount) {
    console.log("\nTo buy tokens, run:");
    console.log("export AMOUNT=1000");
    console.log("npx hardhat run scripts/buy-tokens.ts --network sepolia");
    process.exit(0);
  }

  if (isNaN(Number(amount))) {
    console.error("❌ Please provide a valid number for AMOUNT");
    process.exit(1);
  }

  const tokenAmount = ethers.parseEther(amount);

  if (graduationStatus) {
    // Token has graduated, use Uniswap
    console.log("\n🔄 Token has graduated, using Uniswap...");

    // Get Uniswap pair
    const uniswapFactoryAddress = await bondingCurve.uniswapFactory();
    const uniswapFactory = IUniswapV2Factory__factory.connect(
      uniswapFactoryAddress,
      user
    );
    const pair = await uniswapFactory.getPair(
      aaplTokenAddress,
      evilUSDCAddress
    );
    const pairContract = IUniswapV2Pair__factory.connect(pair, user);

    // Get reserves
    const [reserve0, reserve1] = await pairContract.getReserves();
    const token0 = await pairContract.token0();
    const token1 = await pairContract.token1();

    // Calculate amounts
    const tokenReserve = token0 === aaplTokenAddress ? reserve0 : reserve1;
    const assetReserve = token0 === aaplTokenAddress ? reserve1 : reserve0;

    // Calculate expected output using constant product formula
    const expectedOutput =
      (tokenAmount * assetReserve) / (tokenReserve + tokenAmount);
    const minOutput = (expectedOutput * 95n) / 100n; // 5% slippage tolerance

    console.log("\n💰 Uniswap Purchase Details:");
    console.log("Amount to Buy:", ethers.formatEther(tokenAmount), "AAPL");
    console.log(
      "Expected Cost:",
      ethers.formatUnits(expectedOutput, 6),
      "EVILUSDC"
    );
    console.log(
      "Minimum Output:",
      ethers.formatUnits(minOutput, 6),
      "EVILUSDC"
    );

    // Approve EVILUSDC if needed
    const allowance = await evilUSDC.allowance(
      user.address,
      uniswapRouterAddress
    );
    if (allowance < expectedOutput) {
      console.log("\n🔑 Approving EVILUSDC...");
      const approveTx = await evilUSDC.approve(
        uniswapRouterAddress,
        expectedOutput
      );
      await approveTx.wait();
    }

    // Execute swap
    console.log("\n🔄 Executing Uniswap swap...");
    const swapTx = await uniswapRouter.swapExactTokensForTokens(
      expectedOutput,
      minOutput,
      [evilUSDCAddress, aaplTokenAddress],
      user.address,
      Math.floor(Date.now() / 1000) + 300 // 5 minutes deadline
    );
    await swapTx.wait();
  } else {
    // Token hasn't graduated, use bonding curve
    console.log("\n🔄 Using bonding curve...");

    // Calculate purchase price
    const purchasePrice = await bondingCurve.calculatePurchasePrice(
      tokenAmount
    );
    console.log("\n💰 Purchase Details:");
    console.log("Amount to Buy:", ethers.formatEther(tokenAmount), "AAPL");
    console.log("Price:", ethers.formatUnits(purchasePrice, 6), "EVILUSDC");

    // Approve EVILUSDC if needed
    const allowance = await evilUSDC.allowance(
      user.address,
      bondingCurveAddress
    );
    if (allowance < purchasePrice) {
      console.log("\n🔑 Approving EVILUSDC...");
      const approveTx = await evilUSDC.approve(
        bondingCurveAddress,
        purchasePrice
      );
      await approveTx.wait();
    }

    // Buy tokens
    console.log("\n🔄 Buying tokens...");
    const buyTx = await bondingCurve.buyTokens(tokenAmount, purchasePrice);
    await buyTx.wait();
  }

  // Get new balances
  const newEvilUSDCBalance = await evilUSDC.balanceOf(user.address);
  const newAaplBalance = await aaplToken.balanceOf(user.address);
  const newGraduationStatus = await bondingCurve.getGraduationStatus();

  console.log("\n✅ Transaction Complete!");
  console.log(
    "New EVILUSDC Balance:",
    ethers.formatUnits(newEvilUSDCBalance, 6)
  );
  console.log("New AAPL Balance:", ethers.formatEther(newAaplBalance));
  console.log(
    "New Graduation Status:",
    newGraduationStatus ? "Graduated" : "Not Graduated"
  );

  // If graduated, show Uniswap pair info
  if (newGraduationStatus) {
    const uniswapFactoryAddress = await bondingCurve.uniswapFactory();
    const uniswapFactory = IUniswapV2Factory__factory.connect(
      uniswapFactoryAddress,
      user
    );
    const pair = await uniswapFactory.getPair(
      aaplTokenAddress,
      evilUSDCAddress
    );
    console.log("\n🎓 Token Graduated!");
    console.log("Uniswap Pair Address:", pair);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Operation failed:", error);
    process.exit(1);
  });
