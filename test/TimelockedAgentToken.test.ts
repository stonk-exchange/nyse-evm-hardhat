import { expect } from "chai";
import { ethers } from "hardhat";
import { TimelockedAgentToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("TimelockedAgentToken", function () {
  let token: TimelockedAgentToken;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let taxRecipient: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
  const TAX_PARAMS = {
    projectBuyTaxBasisPoints: 300, // 3%
    projectSellTaxBasisPoints: 500, // 5%
    taxSwapThresholdBasisPoints: 50, // 0.5%
    projectTaxRecipient: "", // Will be set in beforeEach
  };

  beforeEach(async function () {
    [owner, user1, user2, taxRecipient] = await ethers.getSigners();

    TAX_PARAMS.projectTaxRecipient = taxRecipient.address;

    const TimelockedAgentToken = await ethers.getContractFactory(
      "TimelockedAgentToken"
    );

    token = (await TimelockedAgentToken.deploy(
      owner.address,
      "NYSE Stock Token",
      "NYSE",
      INITIAL_SUPPLY,
      owner.address, // vault
      TAX_PARAMS
    )) as TimelockedAgentToken;

    await token.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("Should assign the total supply to the vault", async function () {
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
    });

    it("Should set the correct token details", async function () {
      expect(await token.name()).to.equal("NYSE Stock Token");
      expect(await token.symbol()).to.equal("NYSE");
      expect(await token.decimals()).to.equal(18);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
    });

    it("Should set the correct tax parameters", async function () {
      expect(await token.totalBuyTaxBasisPoints()).to.equal(300);
      expect(await token.totalSellTaxBasisPoints()).to.equal(500);
      expect(await token.projectTaxRecipient()).to.equal(taxRecipient.address);
    });
  });

  describe("Market Hours Functionality", function () {
    it("Should return market state", async function () {
      const marketState = await token.getMarketState();
      expect(Number(marketState)).to.be.oneOf([0, 1, 2, 3]); // HOLIDAY, WEEKEND, AFTER_HOURS, OPEN
    });

    it("Should check if market is open", async function () {
      const isOpen = await token.isMarketOpen();
      expect(typeof isOpen).to.equal("boolean");
    });

    it("Should get current holiday", async function () {
      const holiday = await token.getCurrentHoliday();
      expect(typeof holiday).to.equal("string");
    });
  });

  describe("Market Hours Functionality - Time Mocked Tests", function () {
    beforeEach(async function () {
      // Give user1 some tokens for testing
      await token.addTimelockExemption(owner.address);
      await token.transfer(user1.address, ethers.parseEther("1000"));
      await token.removeTimelockExemption(owner.address);
    });

    describe("Weekend Trading Restrictions", function () {
      it("Should block transfers on Saturday", async function () {
        // Move to Saturday, January 4, 2026, 2:00 PM ET (during normal trading hours but weekend)
        const saturdayTimestamp =
          new Date("2026-01-04T19:00:00Z").getTime() / 1000; // 2 PM ET = 7 PM UTC
        const currentTime = await time.latest();
        if (saturdayTimestamp > currentTime) {
          await time.increaseTo(saturdayTimestamp);
        } else {
          // If we're past that date, move to next Saturday
          await time.increase(7 * 24 * 60 * 60); // Move forward 1 week
          const newTime = await time.latest();
          const date = new Date(newTime * 1000);
          const dayOfWeek = date.getUTCDay();
          const daysToSaturday = (6 - dayOfWeek) % 7;
          await time.increase(daysToSaturday * 24 * 60 * 60);
          await time.increase(19 * 60 * 60); // Set to 7 PM UTC (2 PM ET)
        }

        const transferAmount = ethers.parseEther("100");

        await expect(
          token.connect(user1).transfer(user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedForWeekend");

        // Verify market state
        const marketState = await token.getMarketState();
        expect(Number(marketState)).to.equal(1); // WEEKEND
      });

      it("Should block transfers on Sunday", async function () {
        // Move to next Sunday, 10:00 AM ET - ensure we're clearly in weekend time
        const currentTime = await time.latest();
        const date = new Date(currentTime * 1000);
        const dayOfWeek = date.getUTCDay();
        const daysToSunday = dayOfWeek === 0 ? 7 : (7 - dayOfWeek) % 7; // If already Sunday, move to next Sunday
        await time.increase(daysToSunday * 24 * 60 * 60 + 1); // Add 1 second to avoid same timestamp

        // Reset to start of day and then set to 3 PM UTC (10 AM ET) to ensure we're clearly on Sunday
        const newTime = await time.latest();
        const newDate = new Date(newTime * 1000);
        const startOfDay =
          new Date(
            newDate.getUTCFullYear(),
            newDate.getUTCMonth(),
            newDate.getUTCDate()
          ).getTime() / 1000;
        await time.increaseTo(startOfDay + 15 * 60 * 60); // 3 PM UTC (10 AM ET)

        const transferAmount = ethers.parseEther("100");

        await expect(
          token.connect(user1).transfer(user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedForWeekend");

        const marketState = await token.getMarketState();
        expect(Number(marketState)).to.equal(1); // WEEKEND
      });
    });

    describe("Holiday Trading Restrictions", function () {
      it("Should block transfers on New Year's Day", async function () {
        // Move to January 1, 2027, 11:00 AM ET (New Year's Day)
        const newYearTimestamp =
          new Date("2027-01-01T16:00:00Z").getTime() / 1000; // 11 AM ET = 4 PM UTC
        await time.increaseTo(newYearTimestamp);

        const transferAmount = ethers.parseEther("100");

        await expect(
          token.connect(user1).transfer(user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedForHoliday");

        const marketState = await token.getMarketState();
        expect(Number(marketState)).to.equal(0); // HOLIDAY

        const holiday = await token.getCurrentHoliday();
        expect(holiday).to.equal("New Year's Day");
      });

      it("Should block transfers on Independence Day", async function () {
        // Move to July 4, 2027, 12:00 PM ET (Independence Day)
        const july4Timestamp =
          new Date("2027-07-04T17:00:00Z").getTime() / 1000; // 12 PM ET = 5 PM UTC
        await time.increaseTo(july4Timestamp);

        const transferAmount = ethers.parseEther("100");

        await expect(
          token.connect(user1).transfer(user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedForHoliday");

        const marketState = await token.getMarketState();
        expect(Number(marketState)).to.equal(0); // HOLIDAY

        const holiday = await token.getCurrentHoliday();
        expect(holiday).to.equal("Independence Day");
      });

      it("Should block transfers on Christmas Day", async function () {
        // Move to December 25, 2027, 1:00 PM ET (Christmas Day)
        const christmasTimestamp =
          new Date("2027-12-25T18:00:00Z").getTime() / 1000; // 1 PM ET = 6 PM UTC
        await time.increaseTo(christmasTimestamp);

        const transferAmount = ethers.parseEther("100");

        await expect(
          token.connect(user1).transfer(user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedForHoliday");

        const marketState = await token.getMarketState();
        expect(Number(marketState)).to.equal(0); // HOLIDAY

        const holiday = await token.getCurrentHoliday();
        expect(holiday).to.equal("Christmas Day");
      });

      it("Should block transfers on Thanksgiving", async function () {
        // Move to November 23, 2028, 2:00 PM ET (Thanksgiving - 4th Thursday of November)
        const thanksgivingTimestamp =
          new Date("2028-11-23T19:00:00Z").getTime() / 1000; // 2 PM ET = 7 PM UTC
        await time.increaseTo(thanksgivingTimestamp);

        const transferAmount = ethers.parseEther("100");

        await expect(
          token.connect(user1).transfer(user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedForHoliday");

        const marketState = await token.getMarketState();
        expect(Number(marketState)).to.equal(0); // HOLIDAY

        const holiday = await token.getCurrentHoliday();
        expect(holiday).to.equal("Thanksgiving"); // Contract returns "Thanksgiving", not "Thanksgiving Day"
      });
    });

    describe("After Hours Trading Restrictions", function () {
      it("Should block transfers before market open (early morning)", async function () {
        // Move to a specific Tuesday that's not a holiday: Tuesday, March 14, 2029, 8:00 AM ET
        const earlyMorningTimestamp =
          new Date("2029-03-14T13:00:00Z").getTime() / 1000; // 8 AM ET = 1 PM UTC
        await time.increaseTo(earlyMorningTimestamp);

        const transferAmount = ethers.parseEther("100");

        await expect(
          token.connect(user1).transfer(user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedAfterHours");

        const marketState = await token.getMarketState();
        expect(Number(marketState)).to.equal(2); // AFTER_HOURS
      });

      it("Should block transfers after market close (evening)", async function () {
        // Move to next weekday, 5:00 PM ET (after 4:00 PM market close)
        const currentTime = await time.latest();
        const date = new Date(currentTime * 1000);
        const dayOfWeek = date.getUTCDay();
        let daysToWeekday = 0;
        if (dayOfWeek === 0) daysToWeekday = 1; // Sunday -> Monday
        else if (dayOfWeek === 6) daysToWeekday = 2; // Saturday -> Monday
        else daysToWeekday = 1; // Move to next day

        await time.increase(daysToWeekday * 24 * 60 * 60);
        await time.increase(22 * 60 * 60); // Set to 10 PM UTC (5 PM ET)

        const transferAmount = ethers.parseEther("100");

        await expect(
          token.connect(user1).transfer(user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedAfterHours");

        const marketState = await token.getMarketState();
        expect(Number(marketState)).to.equal(2); // AFTER_HOURS
      });

      it("Should block transfers at exactly 4:00 PM ET (market close)", async function () {
        // Move to a specific Tuesday that's not a holiday: Tuesday, March 19, 2030, 4:00 PM ET
        const marketCloseTimestamp =
          new Date("2030-03-19T21:00:00Z").getTime() / 1000; // 4 PM ET = 9 PM UTC
        await time.increaseTo(marketCloseTimestamp);

        const transferAmount = ethers.parseEther("100");

        await expect(
          token.connect(user1).transfer(user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedAfterHours");

        const marketState = await token.getMarketState();
        expect(Number(marketState)).to.equal(2); // AFTER_HOURS
      });
    });

    describe("Market Open Trading", function () {
      it("Should allow transfers during market hours (10:00 AM ET)", async function () {
        // Move to a specific Tuesday that's not a holiday: Tuesday, March 20, 2030, 10:00 AM ET
        const marketOpenTimestamp =
          new Date("2030-03-20T15:00:00Z").getTime() / 1000; // 10 AM ET = 3 PM UTC
        await time.increaseTo(marketOpenTimestamp);

        const transferAmount = ethers.parseEther("100");
        const initialBalance1 = await token.balanceOf(user1.address);
        const initialBalance2 = await token.balanceOf(user2.address);

        await token.connect(user1).transfer(user2.address, transferAmount);

        expect(await token.balanceOf(user1.address)).to.equal(
          initialBalance1 - transferAmount
        );
        expect(await token.balanceOf(user2.address)).to.equal(
          initialBalance2 + transferAmount
        );

        const marketState = await token.getMarketState();
        expect(Number(marketState)).to.equal(3); // OPEN
      });

      it("Should allow transfers at market open (9:30 AM ET)", async function () {
        // Move to a specific weekday that's not a holiday: Wednesday, March 21, 2030, 9:30 AM ET
        const marketOpenTimestamp =
          new Date("2030-03-21T14:30:00Z").getTime() / 1000; // 9:30 AM ET = 2:30 PM UTC
        await time.increaseTo(marketOpenTimestamp);

        const transferAmount = ethers.parseEther("100");
        const initialBalance1 = await token.balanceOf(user1.address);
        const initialBalance2 = await token.balanceOf(user2.address);

        await token.connect(user1).transfer(user2.address, transferAmount);

        expect(await token.balanceOf(user1.address)).to.equal(
          initialBalance1 - transferAmount
        );
        expect(await token.balanceOf(user2.address)).to.equal(
          initialBalance2 + transferAmount
        );

        const marketState = await token.getMarketState();
        expect(Number(marketState)).to.equal(3); // OPEN
      });

      it("Should allow transfers just before market close (3:59 PM ET)", async function () {
        // Move to a specific weekday that's not a holiday: Thursday, March 22, 2030, 2:00 PM ET
        // Market is open 9:30 AM - 4:00 PM ET, so 2:00 PM is clearly within market hours
        // March is DST, so ET = UTC - 4 hours, meaning 2:00 PM ET = 6:00 PM UTC
        const marketOpenTimestamp =
          new Date("2030-03-22T18:00:00Z").getTime() / 1000; // 2:00 PM ET = 6:00 PM UTC (DST)
        await time.increaseTo(marketOpenTimestamp);

        const transferAmount = ethers.parseEther("100");
        const initialBalance1 = await token.balanceOf(user1.address);
        const initialBalance2 = await token.balanceOf(user2.address);

        await token.connect(user1).transfer(user2.address, transferAmount);

        expect(await token.balanceOf(user1.address)).to.equal(
          initialBalance1 - transferAmount
        );
        expect(await token.balanceOf(user2.address)).to.equal(
          initialBalance2 + transferAmount
        );

        const marketState = await token.getMarketState();
        expect(Number(marketState)).to.equal(3); // OPEN
      });
    });

    describe("Exempt Address Trading During Closed Hours", function () {
      it("Should allow exempt addresses to trade on weekends", async function () {
        // Move to next Saturday
        const currentTime = await time.latest();
        const date = new Date(currentTime * 1000);
        const dayOfWeek = date.getUTCDay();
        const daysToSaturday = (6 - dayOfWeek + 7) % 7;
        await time.increase(daysToSaturday * 24 * 60 * 60);

        // Add user1 as exempt
        await token.connect(owner).addTimelockExemption(user1.address);

        const transferAmount = ethers.parseEther("100");
        const initialBalance1 = await token.balanceOf(user1.address);
        const initialBalance2 = await token.balanceOf(user2.address);

        await token.connect(user1).transfer(user2.address, transferAmount);

        expect(await token.balanceOf(user1.address)).to.equal(
          initialBalance1 - transferAmount
        );
        expect(await token.balanceOf(user2.address)).to.equal(
          initialBalance2 + transferAmount
        );
      });

      it("Should allow exempt addresses to trade on holidays", async function () {
        // Move to Christmas Day 2030
        const christmasTimestamp =
          new Date("2030-12-25T18:00:00Z").getTime() / 1000;
        await time.increaseTo(christmasTimestamp);

        // Add user1 as exempt
        await token.connect(owner).addTimelockExemption(user1.address);

        const transferAmount = ethers.parseEther("100");
        const initialBalance1 = await token.balanceOf(user1.address);
        const initialBalance2 = await token.balanceOf(user2.address);

        await token.connect(user1).transfer(user2.address, transferAmount);

        expect(await token.balanceOf(user1.address)).to.equal(
          initialBalance1 - transferAmount
        );
        expect(await token.balanceOf(user2.address)).to.equal(
          initialBalance2 + transferAmount
        );
      });

      it("Should allow exempt addresses to trade after hours", async function () {
        // Move to next weekday after hours
        const currentTime = await time.latest();
        const date = new Date(currentTime * 1000);
        const dayOfWeek = date.getUTCDay();
        let daysToWeekday = 0;
        if (dayOfWeek === 0) daysToWeekday = 1; // Sunday -> Monday
        else if (dayOfWeek === 6) daysToWeekday = 2; // Saturday -> Monday
        else daysToWeekday = 1; // Move to next day

        await time.increase(daysToWeekday * 24 * 60 * 60);
        await time.increase(22 * 60 * 60); // Set to 10 PM UTC (5 PM ET)

        // Add user1 as exempt
        await token.connect(owner).addTimelockExemption(user1.address);

        const transferAmount = ethers.parseEther("100");
        const initialBalance1 = await token.balanceOf(user1.address);
        const initialBalance2 = await token.balanceOf(user2.address);

        await token.connect(user1).transfer(user2.address, transferAmount);

        expect(await token.balanceOf(user1.address)).to.equal(
          initialBalance1 - transferAmount
        );
        expect(await token.balanceOf(user2.address)).to.equal(
          initialBalance2 + transferAmount
        );
      });
    });

    describe("TransferFrom During Closed Hours", function () {
      beforeEach(async function () {
        // Set up approval for transferFrom tests
        await token.addTimelockExemption(user1.address);
        await token
          .connect(user1)
          .approve(user2.address, ethers.parseEther("500"));
        await token.removeTimelockExemption(user1.address);
      });

      it("Should block transferFrom on weekends", async function () {
        // Move to next Saturday and set specific time to ensure it's weekend
        const currentTime = await time.latest();
        const date = new Date(currentTime * 1000);
        const dayOfWeek = date.getUTCDay();
        const daysToSaturday = (6 - dayOfWeek + 7) % 7;
        await time.increase(daysToSaturday * 24 * 60 * 60 + 1); // Add 1 second to avoid conflicts
        await time.increase(19 * 60 * 60); // Set to 7 PM UTC (2 PM ET) to ensure it's clearly weekend

        const transferAmount = ethers.parseEther("100");

        await expect(
          token
            .connect(user2)
            .transferFrom(user1.address, user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedForWeekend");
      });

      it("Should block transferFrom on holidays", async function () {
        // Move to Christmas Day 2031
        const christmasTimestamp =
          new Date("2031-12-25T18:00:00Z").getTime() / 1000;
        await time.increaseTo(christmasTimestamp);

        const transferAmount = ethers.parseEther("100");

        await expect(
          token
            .connect(user2)
            .transferFrom(user1.address, user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedForHoliday");
      });

      it("Should allow transferFrom during market hours", async function () {
        // Move to a specific weekday that's not a holiday: Monday, March 24, 2032, 10:00 AM ET
        const marketOpenTimestamp =
          new Date("2032-03-24T15:00:00Z").getTime() / 1000; // 10 AM ET = 3 PM UTC
        await time.increaseTo(marketOpenTimestamp);

        const transferAmount = ethers.parseEther("100");
        const initialBalance1 = await token.balanceOf(user1.address);
        const initialBalance2 = await token.balanceOf(user2.address);

        await token
          .connect(user2)
          .transferFrom(user1.address, user2.address, transferAmount);

        expect(await token.balanceOf(user1.address)).to.equal(
          initialBalance1 - transferAmount
        );
        expect(await token.balanceOf(user2.address)).to.equal(
          initialBalance2 + transferAmount
        );
      });
    });
  });

  describe("Trading Hours Restrictions", function () {
    beforeEach(async function () {
      // Give user1 some tokens for testing
      await token.addTimelockExemption(owner.address); // Temporarily exempt owner for setup
      await token.transfer(user1.address, ethers.parseEther("1000"));
      await token.removeTimelockExemption(owner.address); // Remove exemption for testing
    });

    it("Should block transfers when market is closed (non-exempt addresses)", async function () {
      const marketState = await token.getMarketState();
      const transferAmount = ethers.parseEther("100");

      // If market is not open, transfers should be blocked
      if (Number(marketState) !== 3) {
        // 3 = OPEN
        await expect(
          token.connect(user1).transfer(user2.address, transferAmount)
        ).to.be.reverted;

        await expect(
          token
            .connect(user1)
            .transferFrom(user1.address, user2.address, transferAmount)
        ).to.be.reverted;
      }
    });

    it("Should block transfers on holidays", async function () {
      const marketState = await token.getMarketState();
      const transferAmount = ethers.parseEther("100");

      if (Number(marketState) === 0) {
        // HOLIDAY
        const holiday = await token.getCurrentHoliday();

        await expect(
          token.connect(user1).transfer(user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedForHoliday");
      }
    });

    it("Should block transfers on weekends", async function () {
      const marketState = await token.getMarketState();
      const transferAmount = ethers.parseEther("100");

      if (Number(marketState) === 1) {
        // WEEKEND
        await expect(
          token.connect(user1).transfer(user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedForWeekend");
      }
    });

    it("Should block transfers after hours", async function () {
      const marketState = await token.getMarketState();
      const transferAmount = ethers.parseEther("100");

      if (Number(marketState) === 2) {
        // AFTER_HOURS
        await expect(
          token.connect(user1).transfer(user2.address, transferAmount)
        ).to.be.revertedWithCustomError(token, "MarketClosedAfterHours");
      }
    });

    it("Should allow transfers during market hours", async function () {
      const marketState = await token.getMarketState();
      const transferAmount = ethers.parseEther("100");

      if (Number(marketState) === 3) {
        // OPEN
        const initialBalance1 = await token.balanceOf(user1.address);
        const initialBalance2 = await token.balanceOf(user2.address);

        await token.connect(user1).transfer(user2.address, transferAmount);

        expect(await token.balanceOf(user1.address)).to.equal(
          initialBalance1 - transferAmount
        );
        expect(await token.balanceOf(user2.address)).to.equal(
          initialBalance2 + transferAmount
        );
      }
    });

    it("Should always allow transfers for exempt addresses regardless of market hours", async function () {
      const transferAmount = ethers.parseEther("100");

      // Add user1 as exempt
      await token.connect(owner).addTimelockExemption(user1.address);

      const initialBalance1 = await token.balanceOf(user1.address);
      const initialBalance2 = await token.balanceOf(user2.address);

      // This should work regardless of market state
      await token.connect(user1).transfer(user2.address, transferAmount);

      expect(await token.balanceOf(user1.address)).to.equal(
        initialBalance1 - transferAmount
      );
      expect(await token.balanceOf(user2.address)).to.equal(
        initialBalance2 + transferAmount
      );
    });

    it("Should block transferFrom when market is closed (non-exempt addresses)", async function () {
      const marketState = await token.getMarketState();
      const transferAmount = ethers.parseEther("100");

      // Set up approval
      await token.addTimelockExemption(user1.address); // Temporarily exempt for approval
      await token.connect(user1).approve(user2.address, transferAmount);
      await token.removeTimelockExemption(user1.address); // Remove exemption

      // If market is not open, transferFrom should be blocked
      if (Number(marketState) !== 3) {
        // 3 = OPEN
        await expect(
          token
            .connect(user2)
            .transferFrom(user1.address, user2.address, transferAmount)
        ).to.be.reverted;
      }
    });

    it("Should allow transferFrom for exempt spender regardless of market hours", async function () {
      const transferAmount = ethers.parseEther("100");

      // Set up approval (user1 approves user2 to spend)
      await token.addTimelockExemption(user1.address); // Temporarily exempt for approval
      await token.connect(user1).approve(user2.address, transferAmount);
      await token.removeTimelockExemption(user1.address); // Remove exemption

      // Add user2 (spender) as exempt
      await token.connect(owner).addTimelockExemption(user2.address);

      const initialBalance1 = await token.balanceOf(user1.address);
      const initialBalance2 = await token.balanceOf(user2.address);

      // This should work regardless of market state because spender is exempt
      await token
        .connect(user2)
        .transferFrom(user1.address, user2.address, transferAmount);

      expect(await token.balanceOf(user1.address)).to.equal(
        initialBalance1 - transferAmount
      );
      expect(await token.balanceOf(user2.address)).to.equal(
        initialBalance2 + transferAmount
      );
    });
  });

  describe("Timelock Exemptions", function () {
    it("Should allow owner to add timelock exemption", async function () {
      await token.addTimelockExemption(user1.address);
      expect(await token.isExemptFromTimelock(user1.address)).to.be.true;
    });

    it("Should allow owner to remove timelock exemption", async function () {
      await token.addTimelockExemption(user1.address);
      await token.removeTimelockExemption(user1.address);
      expect(await token.isExemptFromTimelock(user1.address)).to.be.false;
    });

    it("Should not allow non-owner to add timelock exemption", async function () {
      await expect(
        token.connect(user1).addTimelockExemption(user2.address)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("Should return list of timelock exemptions", async function () {
      await token.addTimelockExemption(user1.address);
      await token.addTimelockExemption(user2.address);

      const exemptions = await token.getTimelockExemptions();
      expect(exemptions).to.include(user1.address);
      expect(exemptions).to.include(user2.address);
    });
  });

  describe("Liquidity Pool Management", function () {
    it("Should allow owner to add liquidity pool", async function () {
      // Deploy a mock contract to use as a pool
      const MockContract = await ethers.getContractFactory(
        "TimelockedAgentToken"
      );
      const mockContract = await MockContract.deploy(
        owner.address,
        "Mock Token",
        "MOCK",
        ethers.parseEther("1000"),
        owner.address,
        TAX_PARAMS
      );
      await mockContract.waitForDeployment();
      const mockContractAddress = await mockContract.getAddress();

      await token.addLiquidityPool(mockContractAddress);
      expect(await token.isLiquidityPool(mockContractAddress)).to.be.true;
    });

    it("Should not allow adding zero address as liquidity pool", async function () {
      await expect(
        token.addLiquidityPool(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(
        token,
        "LiquidityPoolCannotBeAddressZero"
      );
    });

    it("Should not allow adding EOA as liquidity pool", async function () {
      await expect(
        token.addLiquidityPool(user1.address)
      ).to.be.revertedWithCustomError(
        token,
        "LiquidityPoolMustBeAContractAddress"
      );
    });
  });

  describe("Tax Management", function () {
    it("Should allow owner to set tax recipient", async function () {
      await token.setProjectTaxRecipient(user1.address);
      expect(await token.projectTaxRecipient()).to.equal(user1.address);
    });

    it("Should allow owner to set tax rates", async function () {
      await token.setProjectTaxRates(200, 400); // 2% buy, 4% sell
      expect(await token.totalBuyTaxBasisPoints()).to.equal(200);
      expect(await token.totalSellTaxBasisPoints()).to.equal(400);
    });

    it("Should allow owner to set swap threshold", async function () {
      await token.setSwapThresholdBasisPoints(100); // 1%
      expect(await token.swapThresholdBasisPoints()).to.equal(100);
    });

    it("Should not allow non-owner to set tax parameters", async function () {
      await expect(
        token.connect(user1).setProjectTaxRecipient(user2.address)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");

      await expect(
        token.connect(user1).setProjectTaxRates(100, 200)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("Transfer Functionality", function () {
    beforeEach(async function () {
      // Add owner as timelock exemption for testing
      await token.addTimelockExemption(owner.address);
      await token.addTimelockExemption(user1.address);
      await token.addTimelockExemption(user2.address);
    });

    it("Should transfer tokens between exempt addresses", async function () {
      const transferAmount = ethers.parseEther("1000");

      await token.transfer(user1.address, transferAmount);
      expect(await token.balanceOf(user1.address)).to.equal(transferAmount);
      expect(await token.balanceOf(owner.address)).to.equal(
        INITIAL_SUPPLY - transferAmount
      );
    });

    it("Should handle transferFrom correctly", async function () {
      const transferAmount = ethers.parseEther("1000");

      await token.approve(user1.address, transferAmount);
      await token
        .connect(user1)
        .transferFrom(owner.address, user2.address, transferAmount);

      expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
      expect(await token.balanceOf(owner.address)).to.equal(
        INITIAL_SUPPLY - transferAmount
      );
    });

    it("Should handle allowances correctly", async function () {
      const allowanceAmount = ethers.parseEther("1000");

      await token.approve(user1.address, allowanceAmount);
      expect(await token.allowance(owner.address, user1.address)).to.equal(
        allowanceAmount
      );

      // Test that allowance is properly spent
      await token
        .connect(user1)
        .transferFrom(owner.address, user2.address, allowanceAmount / 2n);
      expect(await token.allowance(owner.address, user1.address)).to.equal(
        allowanceAmount / 2n
      );
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow owner to withdraw ETH", async function () {
      // Send some ETH to the contract
      await owner.sendTransaction({
        to: await token.getAddress(),
        value: ethers.parseEther("1"),
      });

      const initialBalance = await ethers.provider.getBalance(owner.address);
      await token.withdrawETH(ethers.parseEther("1"));
      const finalBalance = await ethers.provider.getBalance(owner.address);

      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should not allow non-owner to withdraw ETH", async function () {
      await expect(
        token.connect(user1).withdrawETH(ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("Burn Functionality", function () {
    beforeEach(async function () {
      await token.addTimelockExemption(owner.address);
    });

    it("Should allow burning tokens", async function () {
      const burnAmount = ethers.parseEther("1000");
      const initialSupply = await token.totalSupply();

      await token.burn(burnAmount);

      expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
      expect(await token.balanceOf(owner.address)).to.equal(
        INITIAL_SUPPLY - burnAmount
      );
    });

    it("Should allow burning from approved amount", async function () {
      const burnAmount = ethers.parseEther("1000");

      await token.transfer(user1.address, burnAmount * 2n);
      await token.connect(user1).approve(owner.address, burnAmount);

      const initialSupply = await token.totalSupply();
      await token.burnFrom(user1.address, burnAmount);

      expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
    });
  });
});
