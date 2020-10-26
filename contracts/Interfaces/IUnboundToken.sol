pragma solidity >=0.4.23 <0.8.0;

interface IUnboundToken {
    function _mint(address account, uint256 amount, uint256 fee, address LLCAddr, uint256 minTokenAmount) external;
    function _burn(address account, uint256 toBurn, address LLCAddr) external;
    function checkLoan(address user, address lockLocation) external view returns (uint256 owed);
    function balanceOf(address account) external view returns (uint256); 
}