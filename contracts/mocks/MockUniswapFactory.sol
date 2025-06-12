// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockUniswapFactory {
    mapping(address => mapping(address => address)) public pairs;

    function createPair(
        address tokenA,
        address tokenB
    ) external returns (address pair) {
        require(tokenA != tokenB, "UniswapV2: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2: ZERO_ADDRESS");
        require(pairs[token0][token1] == address(0), "UniswapV2: PAIR_EXISTS");

        // Create a mock pair address
        pair = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(token0, token1, block.timestamp))
                )
            )
        );
        pairs[token0][token1] = pair;
        pairs[token1][token0] = pair;

        return pair;
    }

    function getPair(
        address tokenA,
        address tokenB
    ) external view returns (address pair) {
        return pairs[tokenA][tokenB];
    }
}
