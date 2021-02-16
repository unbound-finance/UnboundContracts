pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC777/IERC777Sender.sol";
import "../../LiquidityLockContracts/LiquidityLockContract.sol";
import "../../UnboundTokens/unboundDollar.sol";
import "./TestERC777.sol";

contract Attacker is IERC777Sender {

    bool public active = false;
    LiquidityLockContract public llc;
    UnboundDollar public und;
    TestERC777 public lptContract;

    function setLPTContract(address _lptContract) external {
        lptContract = TestERC777(_lptContract);
    } 

    function setLLC(address _llc) external {
        llc = LiquidityLockContract(_llc);
    }

    function setUND(address _und) external {
        und = UnboundDollar(_und);
    }

    function activate() external {
        active = true;
    }

    function sendLPT(address to, uint256 amount) external {
        lptContract.transfer(to, amount);
    }

    function approve(address spender, uint256 amount) external {
        lptContract.approve(spender, amount);
    }

    function lock(uint256 amount) external {
        llc.lockLPT(amount, 1);
    }

    function tokensToSend(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    ) external override     {
        if (active) {
            llc.unlockLPT(und.checkLoan(address(this), address(llc)));
        }
    }

}