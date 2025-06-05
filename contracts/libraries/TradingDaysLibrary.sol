// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library TradingDaysLibrary {
    // NYSE holidays (simplified version - in production you'd want a more comprehensive system)
    uint256 private constant SECONDS_PER_DAY = 86400;
    uint256 private constant SECONDS_PER_HOUR = 3600;
    uint256 private constant SECONDS_PER_MINUTE = 60;

    // Market hours: 9:30 AM to 4:00 PM ET
    uint256 private constant MARKET_OPEN_HOUR = 9;
    uint256 private constant MARKET_OPEN_MINUTE = 30;
    uint256 private constant MARKET_CLOSE_HOUR = 16;
    uint256 private constant MARKET_CLOSE_MINUTE = 0;

    // DST offset (4 hours during DST, 5 hours during standard time)
    uint256 private constant DST_OFFSET = 4 * SECONDS_PER_HOUR;
    uint256 private constant STANDARD_OFFSET = 5 * SECONDS_PER_HOUR;

    /**
     * @dev Get current time adjusted to Eastern Time
     */
    function getEasternTime() internal view returns (uint256) {
        return block.timestamp - (isDST() ? DST_OFFSET : STANDARD_OFFSET);
    }

    /**
     * @dev Check if it's currently Daylight Saving Time
     * Simplified version - DST runs from second Sunday in March to first Sunday in November
     */
    function isDST() internal view returns (bool) {
        uint256 year = getYear(block.timestamp);
        uint256 dstStart = getDSTStart(year);
        uint256 dstEnd = getDSTEnd(year);

        return block.timestamp >= dstStart && block.timestamp < dstEnd;
    }

    /**
     * @dev Get DST start timestamp for a given year (second Sunday in March at 2 AM)
     */
    function getDSTStart(uint256 year) internal pure returns (uint256) {
        // March 1st of the given year
        uint256 march1 = timestampFromDate(year, 3, 1);
        uint256 dayOfWeek = getDayOfWeek(march1);

        // Find second Sunday: if March 1 is Sunday (0), second Sunday is 14th
        // Otherwise, it's 14 - dayOfWeek + (7 if dayOfWeek > 0)
        uint256 secondSunday;
        if (dayOfWeek == 0) {
            secondSunday = 14;
        } else {
            secondSunday = 14 - dayOfWeek + 7;
        }

        return
            march1 +
            (secondSunday - 1) *
            SECONDS_PER_DAY +
            2 *
            SECONDS_PER_HOUR;
    }

    /**
     * @dev Get DST end timestamp for a given year (first Sunday in November at 2 AM)
     */
    function getDSTEnd(uint256 year) internal pure returns (uint256) {
        // November 1st of the given year
        uint256 nov1 = timestampFromDate(year, 11, 1);
        uint256 dayOfWeek = getDayOfWeek(nov1);

        // Find first Sunday
        uint256 firstSunday = dayOfWeek == 0 ? 1 : 8 - dayOfWeek;

        return
            nov1 + (firstSunday - 1) * SECONDS_PER_DAY + 2 * SECONDS_PER_HOUR;
    }

    /**
     * @dev Check if current time is within core trading hours (9:30 AM - 4:00 PM ET)
     */
    function isCoreTradingHours(
        uint256 easternTime
    ) internal pure returns (bool) {
        uint256 hour = getHour(easternTime);
        uint256 minute = getMinute(easternTime);

        if (hour < MARKET_OPEN_HOUR || hour >= MARKET_CLOSE_HOUR) {
            return false;
        }

        if (hour == MARKET_OPEN_HOUR && minute < MARKET_OPEN_MINUTE) {
            return false;
        }

        return true;
    }

    /**
     * @dev Check if current day is a weekend (Saturday or Sunday)
     */
    function isWeekend(uint256 easternTime) internal pure returns (bool) {
        uint256 dayOfWeek = getDayOfWeek(easternTime);
        return dayOfWeek == 0 || dayOfWeek == 6; // Sunday = 0, Saturday = 6
    }

    /**
     * @dev Check if current day is a NYSE holiday (simplified version)
     */
    function isHoliday(uint256 easternTime) internal pure returns (bool) {
        (uint256 year, uint256 month, uint256 day) = timestampToDate(
            easternTime
        );

        // New Year's Day
        if (month == 1 && day == 1) return true;

        // Independence Day
        if (month == 7 && day == 4) return true;

        // Christmas Day
        if (month == 12 && day == 25) return true;

        // Martin Luther King Jr. Day (third Monday in January)
        if (month == 1 && isThirdMonday(year, month, day)) return true;

        // Presidents Day (third Monday in February)
        if (month == 2 && isThirdMonday(year, month, day)) return true;

        // Memorial Day (last Monday in May)
        if (month == 5 && isLastMonday(year, month, day)) return true;

        // Labor Day (first Monday in September)
        if (month == 9 && isFirstMonday(year, month, day)) return true;

        // Thanksgiving (fourth Thursday in November)
        if (month == 11 && isFourthThursday(year, month, day)) return true;

        return false;
    }

    /**
     * @dev Get current holiday name (simplified version)
     */
    function getCurrentHoliday() internal view returns (string memory) {
        uint256 easternTime = getEasternTime();
        (uint256 year, uint256 month, uint256 day) = timestampToDate(
            easternTime
        );

        if (month == 1 && day == 1) return "New Year's Day";
        if (month == 7 && day == 4) return "Independence Day";
        if (month == 12 && day == 25) return "Christmas Day";
        if (month == 1 && isThirdMonday(year, month, day))
            return "Martin Luther King Jr. Day";
        if (month == 2 && isThirdMonday(year, month, day))
            return "Presidents Day";
        if (month == 5 && isLastMonday(year, month, day)) return "Memorial Day";
        if (month == 9 && isFirstMonday(year, month, day)) return "Labor Day";
        if (month == 11 && isFourthThursday(year, month, day))
            return "Thanksgiving";

        return "Not a Holiday";
    }

    // Helper functions for date calculations
    function isThirdMonday(
        uint256 year,
        uint256 month,
        uint256 day
    ) internal pure returns (bool) {
        uint256 firstOfMonth = timestampFromDate(year, month, 1);
        uint256 firstDayOfWeek = getDayOfWeek(firstOfMonth);
        uint256 firstMonday = firstDayOfWeek <= 1
            ? (2 - firstDayOfWeek)
            : (9 - firstDayOfWeek);
        uint256 thirdMonday = firstMonday + 14;
        return day == thirdMonday;
    }

    function isLastMonday(
        uint256 year,
        uint256 month,
        uint256 day
    ) internal pure returns (bool) {
        uint256 daysInMonth = getDaysInMonth(year, month);
        uint256 lastOfMonth = timestampFromDate(year, month, daysInMonth);
        uint256 lastDayOfWeek = getDayOfWeek(lastOfMonth);
        uint256 lastMonday = daysInMonth -
            (lastDayOfWeek == 0 ? 6 : lastDayOfWeek - 1);
        return day == lastMonday;
    }

    function isFirstMonday(
        uint256 year,
        uint256 month,
        uint256 day
    ) internal pure returns (bool) {
        uint256 firstOfMonth = timestampFromDate(year, month, 1);
        uint256 firstDayOfWeek = getDayOfWeek(firstOfMonth);
        uint256 firstMonday = firstDayOfWeek <= 1
            ? (2 - firstDayOfWeek)
            : (9 - firstDayOfWeek);
        return day == firstMonday;
    }

    function isFourthThursday(
        uint256 year,
        uint256 month,
        uint256 day
    ) internal pure returns (bool) {
        uint256 firstOfMonth = timestampFromDate(year, month, 1);
        uint256 firstDayOfWeek = getDayOfWeek(firstOfMonth);
        uint256 firstThursday = firstDayOfWeek <= 4
            ? (5 - firstDayOfWeek)
            : (12 - firstDayOfWeek);
        uint256 fourthThursday = firstThursday + 21;
        return day == fourthThursday;
    }

    // Basic date/time utility functions
    function getYear(uint256 timestamp) internal pure returns (uint256) {
        uint256 secondsAccountedFor = 0;
        uint256 year = 1970;
        uint256 numLeapYears;

        // Year
        year += timestamp / 31557600; // 365.25 * 24 * 60 * 60
        numLeapYears = leapYearsBefore(year) - leapYearsBefore(1970);

        secondsAccountedFor += 31536000 * (year - 1970); // 365 * 24 * 60 * 60
        secondsAccountedFor += numLeapYears * 86400; // 24 * 60 * 60

        while (secondsAccountedFor > timestamp) {
            if (isLeapYear(year - 1)) {
                secondsAccountedFor -= 31622400; // 366 * 24 * 60 * 60
            } else {
                secondsAccountedFor -= 31536000; // 365 * 24 * 60 * 60
            }
            year -= 1;
        }
        return year;
    }

    function timestampToDate(
        uint256 timestamp
    ) internal pure returns (uint256 year, uint256 month, uint256 day) {
        year = getYear(timestamp);
        uint256 secondsAccountedFor = 0;
        uint256 numLeapYears = leapYearsBefore(year) - leapYearsBefore(1970);

        secondsAccountedFor += 31536000 * (year - 1970);
        secondsAccountedFor += numLeapYears * 86400;

        uint256 secondsInYear = timestamp - secondsAccountedFor;

        uint256[12] memory monthDayCounts;
        monthDayCounts[0] = 31;
        if (isLeapYear(year)) {
            monthDayCounts[1] = 29;
        } else {
            monthDayCounts[1] = 28;
        }
        monthDayCounts[2] = 31;
        monthDayCounts[3] = 30;
        monthDayCounts[4] = 31;
        monthDayCounts[5] = 30;
        monthDayCounts[6] = 31;
        monthDayCounts[7] = 31;
        monthDayCounts[8] = 30;
        monthDayCounts[9] = 31;
        monthDayCounts[10] = 30;
        monthDayCounts[11] = 31;

        uint256 secondsAccountedForMonth = 0;
        for (uint256 i = 1; i <= 12; i++) {
            uint256 secondsInMonth = monthDayCounts[i - 1] * 86400;
            if (secondsInMonth + secondsAccountedForMonth > secondsInYear) {
                month = i;
                break;
            }
            secondsAccountedForMonth += secondsInMonth;
        }

        day = (secondsInYear - secondsAccountedForMonth) / 86400 + 1;
    }

    function timestampFromDate(
        uint256 year,
        uint256 month,
        uint256 day
    ) internal pure returns (uint256) {
        uint256 timestamp = 0;

        // Add years
        for (uint256 i = 1970; i < year; i++) {
            if (isLeapYear(i)) {
                timestamp += 31622400; // 366 days
            } else {
                timestamp += 31536000; // 365 days
            }
        }

        // Add months
        uint256[12] memory monthDays = [
            uint256(31),
            28,
            31,
            30,
            31,
            30,
            31,
            31,
            30,
            31,
            30,
            31
        ];
        if (isLeapYear(year)) {
            monthDays[1] = 29;
        }

        for (uint256 i = 1; i < month; i++) {
            timestamp += monthDays[i - 1] * 86400;
        }

        // Add days
        timestamp += (day - 1) * 86400;

        return timestamp;
    }

    function getDayOfWeek(uint256 timestamp) internal pure returns (uint256) {
        return ((timestamp / 86400) + 4) % 7; // January 1, 1970 was a Thursday (4)
    }

    function getHour(uint256 timestamp) internal pure returns (uint256) {
        return (timestamp / 3600) % 24;
    }

    function getMinute(uint256 timestamp) internal pure returns (uint256) {
        return (timestamp / 60) % 60;
    }

    function isLeapYear(uint256 year) internal pure returns (bool) {
        if (year % 4 != 0) {
            return false;
        }
        if (year % 100 != 0) {
            return true;
        }
        if (year % 400 != 0) {
            return false;
        }
        return true;
    }

    function leapYearsBefore(uint256 year) internal pure returns (uint256) {
        year -= 1;
        return year / 4 - year / 100 + year / 400;
    }

    function getDaysInMonth(
        uint256 year,
        uint256 month
    ) internal pure returns (uint256) {
        if (
            month == 1 ||
            month == 3 ||
            month == 5 ||
            month == 7 ||
            month == 8 ||
            month == 10 ||
            month == 12
        ) {
            return 31;
        } else if (month == 4 || month == 6 || month == 9 || month == 11) {
            return 30;
        } else if (month == 2) {
            if (isLeapYear(year)) {
                return 29;
            } else {
                return 28;
            }
        }
        return 0;
    }
}
