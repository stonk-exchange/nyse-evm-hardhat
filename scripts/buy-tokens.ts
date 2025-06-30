import { ethers } from "hardhat";

async function main() {
  const [user] = await ethers.getSigners();

  // Get addresses from environment variables
  const routerAddress = process.env.ROUTER_ADDRESS;
  const tokenAddress = process.env.TOKEN_ADDRESS;
  const evilUSDCAddress = process.env.EVILUSDC_ADDRESS;

  if (!routerAddress || !tokenAddress || !evilUSDCAddress) {
    console.error("❌ Please provide all required environment variables:");
    console.error("ROUTER_ADDRESS, TOKEN_ADDRESS, EVILUSDC_ADDRESS");
    process.exit(1);
  }

  // Connect to contracts
  const router = await ethers.getContractAt(
    "StonkTradingRouter",
    routerAddress
  );
  const evilUSDC = await ethers.getContractAt("IERC20", evilUSDCAddress);
  const token = await ethers.getContractAt("StonkToken", tokenAddress);

  // Get current balances
  const evilUSDCBalance = await evilUSDC.balanceOf(user.address);
  const tokenBalance = await token.balanceOf(user.address);

  // Get trading state
  const [graduated, bondingCurveAddr, uniswapPair] =
    await router.getTokenTradingState(tokenAddress);

  // Get bonding curve details if not graduated
  let bondingCurveInfo = null;
  if (!graduated && bondingCurveAddr !== ethers.ZeroAddress) {
    try {
      const bondingCurve = await ethers.getContractAt(
        "BondingCurve",
        bondingCurveAddr
      );
      const currentPrice = await bondingCurve.getCurrentPrice();
      const totalSupply = await token.balanceOf(bondingCurveAddr);
      const graduationThreshold = await bondingCurve.getGraduationThreshold();
      const assetToken = await bondingCurve.assetToken();
      const assetBalance = await evilUSDC.balanceOf(bondingCurveAddr);

      bondingCurveInfo = {
        currentPrice,
        totalSupply,
        graduationThreshold,
        assetToken,
        assetBalance,
      };
    } catch (error) {
      console.log(
        "⚠️ Could not fetch bonding curve details:",
        (error as Error).message
      );
    }
  }

  console.log("\n📊 Current State:");
  console.log("----------------------------------------");
  console.log("Your Balances:");
  console.log("EVILUSDC:", ethers.formatUnits(evilUSDCBalance, 6));
  console.log("Token:", ethers.formatEther(tokenBalance));
  console.log("\nTrading State:");
  console.log("Status:", graduated ? "Graduated (Uniswap)" : "Bonding Curve");
  console.log("Bonding Curve:", bondingCurveAddr);
  console.log(
    "Uniswap Pair:",
    uniswapPair !== ethers.ZeroAddress ? uniswapPair : "Not created"
  );

  // Display bonding curve details
  if (bondingCurveInfo) {
    console.log("\n📈 Bonding Curve Status:");
    console.log(
      "Current Price:",
      ethers.formatUnits(bondingCurveInfo.currentPrice, 6),
      "EVILUSDC per token"
    );
    console.log(
      "Total Supply:",
      ethers.formatEther(bondingCurveInfo.totalSupply),
      "tokens"
    );
    console.log(
      "Asset Balance:",
      ethers.formatUnits(bondingCurveInfo.assetBalance, 6),
      "EVILUSDC"
    );
    console.log(
      "Graduation Threshold:",
      ethers.formatUnits(bondingCurveInfo.graduationThreshold, 6),
      "EVILUSDC"
    );
    console.log("Asset Token:", bondingCurveInfo.assetToken);

    // Calculate graduation progress based on asset balance
    const graduationProgress =
      (Number(bondingCurveInfo.assetBalance) /
        Number(bondingCurveInfo.graduationThreshold)) *
      100;
    console.log("Graduation Progress:", graduationProgress.toFixed(2) + "%");

    if (graduationProgress >= 100) {
      console.log("🎯 Ready for graduation!");
    } else {
      console.log(
        "📊 EVILUSDC needed for graduation:",
        ethers.formatUnits(
          bondingCurveInfo.graduationThreshold - bondingCurveInfo.assetBalance,
          6
        )
      );
    }
  }

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

  // Calculate price through router
  const assetAmount = await router.calculateBuyPrice(tokenAddress, tokenAmount);
  const maxAssetAmount = (assetAmount * 105n) / 100n; // 5% slippage tolerance
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes

  console.log("\n💰 Purchase Details:");
  console.log("Amount to Buy:", ethers.formatEther(tokenAmount), "tokens");
  console.log("Expected Cost:", ethers.formatUnits(assetAmount, 6), "EVILUSDC");
  console.log(
    "Max Cost (5% slippage):",
    ethers.formatUnits(maxAssetAmount, 6),
    "EVILUSDC"
  );
  console.log("Trading Mechanism:", graduated ? "Uniswap" : "Bonding Curve");

  // Check if user has enough EVILUSDC
  if (evilUSDCBalance < maxAssetAmount) {
    console.error("❌ Insufficient EVILUSDC balance");
    console.error("Required:", ethers.formatUnits(maxAssetAmount, 6));
    console.error("Available:", ethers.formatUnits(evilUSDCBalance, 6));
    process.exit(1);
  }

  // Approve EVILUSDC if needed
  const allowance = await evilUSDC.allowance(user.address, routerAddress);
  if (allowance < maxAssetAmount) {
    console.log("\n🔑 Approving EVILUSDC...");
    const approveTx = await evilUSDC.approve(routerAddress, maxAssetAmount);
    await approveTx.wait();
    console.log("✅ Approval successful");
  }

  // Buy tokens through router
  console.log("\n🔄 Executing purchase through router...");
  try {
    const buyTx = await router.buyTokens(
      tokenAddress,
      tokenAmount,
      maxAssetAmount,
      deadline
    );

    const receipt = await buyTx.wait();
    console.log("✅ Purchase successful!");
    console.log("Transaction hash:", buyTx.hash);
    console.log("Gas used:", receipt?.gasUsed?.toString());

    // Check new balances
    const newTokenBalance = await token.balanceOf(user.address);
    const newEvilUSDCBalance = await evilUSDC.balanceOf(user.address);

    console.log("\n📊 Updated Balances:");
    console.log("Tokens:", ethers.formatEther(newTokenBalance));
    console.log("EVILUSDC:", ethers.formatUnits(newEvilUSDCBalance, 6));
    console.log(
      "Tokens gained:",
      ethers.formatEther(newTokenBalance - tokenBalance)
    );
    console.log(
      "EVILUSDC spent:",
      ethers.formatUnits(evilUSDCBalance - newEvilUSDCBalance, 6)
    );

    // Check if graduation happened and get updated bonding curve status
    const [newGraduated, newBondingCurveAddr, newUniswapPair] =
      await router.getTokenTradingState(tokenAddress);

    console.log("\n🔄 Updated Trading State:");
    console.log(
      "Status:",
      newGraduated ? "Graduated (Uniswap)" : "Bonding Curve"
    );
    console.log("Bonding Curve:", newBondingCurveAddr);
    console.log(
      "Uniswap Pair:",
      newUniswapPair !== ethers.ZeroAddress ? newUniswapPair : "Not created"
    );

    // Get updated bonding curve details if still not graduated
    if (!newGraduated && newBondingCurveAddr !== ethers.ZeroAddress) {
      try {
        const bondingCurve = await ethers.getContractAt(
          "BondingCurve",
          newBondingCurveAddr
        );
        const newCurrentPrice = await bondingCurve.getCurrentPrice();
        const newTotalSupply = await token.balanceOf(newBondingCurveAddr);
        const newGraduationThreshold =
          await bondingCurve.getGraduationThreshold();
        const newAssetBalance = await evilUSDC.balanceOf(newBondingCurveAddr);

        console.log("\n📈 Updated Bonding Curve Status:");
        console.log(
          "Current Price:",
          ethers.formatUnits(newCurrentPrice, 6),
          "EVILUSDC per token"
        );
        console.log(
          "Total Supply:",
          ethers.formatEther(newTotalSupply),
          "tokens"
        );
        console.log(
          "Asset Balance:",
          ethers.formatUnits(newAssetBalance, 6),
          "EVILUSDC"
        );
        console.log(
          "Graduation Threshold:",
          ethers.formatUnits(newGraduationThreshold, 6),
          "EVILUSDC"
        );

        // Calculate updated graduation progress based on asset balance
        const newGraduationProgress =
          (Number(newAssetBalance) / Number(newGraduationThreshold)) * 100;
        console.log(
          "Graduation Progress:",
          newGraduationProgress.toFixed(2) + "%"
        );

        if (newGraduationProgress >= 100) {
          console.log("🎯 Ready for graduation!");
        } else {
          console.log(
            "📊 EVILUSDC needed for graduation:",
            ethers.formatUnits(newGraduationThreshold - newAssetBalance, 6)
          );
        }

        // Show price change if bonding curve
        if (bondingCurveInfo) {
          const priceChange = newCurrentPrice - bondingCurveInfo.currentPrice;
          const priceChangePercent =
            (Number(priceChange) / Number(bondingCurveInfo.currentPrice)) * 100;
          console.log(
            "Price Change:",
            ethers.formatUnits(priceChange, 6),
            "EVILUSDC (" + priceChangePercent.toFixed(2) + "%)"
          );
        }
      } catch (error) {
        console.log(
          "⚠️ Could not fetch updated bonding curve details:",
          (error as Error).message
        );
      }
    }

    if (!graduated && newGraduated) {
      console.log("\n🎓 Token has graduated to Uniswap!");
      console.log("Uniswap Pair:", newUniswapPair);
    }
  } catch (error) {
    console.error("❌ Purchase failed:", error);
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
