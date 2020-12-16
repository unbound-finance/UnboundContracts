// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.23 <0.8.0;

interface IValuing_01 {
    function unboundCreate(
        uint256 amount,
        address user,
        uint256 minTokenAmount
    ) external;

    function unboundRemove(
        uint256 toUnlock,
        uint256 totalLocked,
        address user
    ) external;
}
