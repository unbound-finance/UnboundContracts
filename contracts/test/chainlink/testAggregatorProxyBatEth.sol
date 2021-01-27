// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "./testAggregatorProxyBase.sol";

contract TestAggregatorProxyBatEth is TestAggregatorProxyBase {
    constructor() {
        _decimals = 18;
    }

    // 2021-02-27 12:23 229884831176629
}
