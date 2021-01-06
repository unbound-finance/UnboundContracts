pragma solidity >=0.4.26 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ISimpleFlashBorrower.sol";

contract SimpleFlashLoan {
    
    IERC20 private _token ;

    constructor(address token) public {
        _token = IERC20(token);
    }

    function flashLoan(uint256 amount) public {
        uint256 balanceBefore = _token.balanceOf(address(this));

        _token.transfer(msg.sender, amount);
        ISimpleFlashBorrower(msg.sender).execute();

        require(_token.balanceOf(address(this)) >= balanceBefore);
    }
}