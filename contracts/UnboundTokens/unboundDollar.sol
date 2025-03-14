// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

// ---------------------------------------------------------------------------------------
//                                   Unbound Dollar (UND)
//
//                                     By: Unbound Finance
// ---------------------------------------------------------------------------------------
// This contract holds the erc20 token call UND. This is the token we will be issuing
// our loans in. This contract contains custom mint and burn functions, only callable from
// an authorized valuing contract. As this contract will be first to be deployed, the
// valuing contract must be authorized by owner.
//
// The loan fee is computed on minting, and the amount distributed to the UND liquidity pool
// (as a reward for liquidity holders), the SAFU fund, and the dev fund. Initial split is
// determined in the constructor. The UND liquidity pool address must be updated on this
// contract by owner once it is created from the uniswap factory.
// ----------------------------------------------------------------------------------------

contract UnboundDollar is IERC20 {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event Mint(address user, address LLCAddr, uint256 newMint);
    event Burn(address user, address LLCAddr, uint256 burned);

    // Admin Change in-prog
    event ChangingAdmin(address indexed oldAdmin, address indexed newAdmin);

    // Admin Changed
    event AdminChanged(address indexed newAdmin);

    // Admin Events
    event NewValuator(address indexed newValuingAddr);
    event NewDevFund(address indexed newDevAddr);
    event NewSafu(address indexed newSafuAddr);
    event NewStaking(address indexed newStakingAddr);
    event NewStakeShare(uint256 newRate);
    event NewSafuShare(uint256 newRate);

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;
    uint256 private _decimals;

    // PERMIT VARIABLES
    bytes32 public DOMAIN_SEPARATOR;
    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 public constant PERMIT_TYPEHASH = 0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;
    mapping(address => uint256) public nonces;

    // staking contract address (40%)
    address private _stakeAddr;

    // Emergency fund (40%)
    address private _safuAddr;

    // Dev fund (20%)
    address private _devFundAddr;

    // Dev Fund split variables
    uint256 public stakeShares; // % of staking to total fee
    uint256 public safuSharesOfStoredFee; // % of safu to stored fee
    uint256 public storedFee;

    // tracks user loan amount in UND. This is the amount of UND they need to pay back to get all locked tokens returned.
    mapping(address => mapping(address => uint256)) private _loaned;

    //Owner Address
    address _owner;

    // 2-step owner change variables
    address private _ownerPending;
    bool private _isPending = false;

    //Valuator Contract Address
    address _valuator;

    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address Safu,
        address devFund
    ) {
        require(Safu != address(0), "Cannot change to 0 address");
        require(devFund != address(0), "Cannot change to 0 address");
        _name = tokenName;
        _symbol = tokenSymbol;
        _decimals = 18;
        _owner = msg.sender;
        _totalSupply = 0;
        _safuAddr = Safu;
        _devFundAddr = devFund;

        // we will use 50/25/25 split of fees
        stakeShares = 50;
        safuSharesOfStoredFee = 50;

        // MUST BE MANUALLY CHANGED TO UND LIQ pool.
        _stakeAddr = Safu;

        uint256 chainId;
        // get chainId of the chain, required for permit

        assembly {
            chainId := chainid()
        }

        // To verify permit() signature
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(tokenName)),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );
    }

    function name() public view returns (string memory) {
        return _name;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function decimals() public view returns (uint256) {
        return _decimals;
    }

    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }

    function stakeAddr() public view returns (address) {
        return _stakeAddr;
    }

    function safuAddr() public view returns (address) {
        return _safuAddr;
    }

    function devFundAddr() public view returns (address) {
        return _devFundAddr;
    }

    function valuator() public view returns (address) {
        return _valuator;
    }

    //  PERMIT FUNCTION
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(deadline >= block.timestamp, "UnboundDollar: EXPIRED");
        bytes32 digest =
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    DOMAIN_SEPARATOR,
                    keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline))
                )
            );
        // check if the data is signed by owner
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress != address(0) && recoveredAddress == owner, "UnboundDollar: INVALID_SIGNATURE");
        _approve(owner, spender, value);
    }

    // Transfer and transferFrom
    function transfer(address recipient, uint256 amount) public override returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(
            sender,
            msg.sender,
            _allowances[sender][msg.sender].sub(amount, "ERC20: transfer amount exceeds allowance")
        );
        return true;
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        //_beforeTokenTransfer(sender, recipient, amount);

        _balances[sender] = _balances[sender].sub(amount, "ERC20: transfer amount exceeds balance");
        _balances[recipient] = _balances[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }

    function allowance(address owner, address spender) public view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) internal {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function increaseAllowance(address spender, uint256 addedValue) external returns (bool) {
        _approve(msg.sender, spender, _allowances[msg.sender][spender].add(addedValue));
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool) {
        _approve(
            msg.sender,
            spender,
            _allowances[msg.sender][spender].sub(subtractedValue, "ERC20: decreased allowance below zero")
        );
        return true;
    }

    // MINT: Only callable by valuing contract - Now splits fees
    function mint(
        address account,
        uint256 loanAmount,
        uint256 feeAmount,
        address LLCAddr
    ) external virtual {
        require(account != address(0), "ERC20: mint to the zero address");
        require(msg.sender == _valuator, "Call does not originate from Valuator");
        require(feeAmount > 0, "UND: Not allowed 0 fee");

        // Credits user with their UND loan, minus fees
        _balances[account] = _balances[account].add(loanAmount.sub(feeAmount));

        // store total to distribute later
        storedFee = storedFee.add(feeAmount);

        // adding total amount of new tokens to totalSupply
        _totalSupply = _totalSupply.add(loanAmount);

        // crediting loan to user
        _loaned[account][LLCAddr] = _loaned[account][LLCAddr].add(loanAmount);

        emit Mint(account, LLCAddr, loanAmount);
    }

    // BURN function. Only callable from Valuing.
    function burn(
        address account,
        uint256 toBurn,
        address LLCAddr
    ) external virtual {
        require(account != address(0), "ERC20: burn from the zero address");
        require(msg.sender == _valuator, "Call does not originate from Valuator");
        require(_loaned[account][LLCAddr] > 0, "You have no loan");

        // // checks if user has enough UND to cover loan and 0.25% fee
        // require(_balances[account] >= toBurn, "Insufficient UND to pay back loan");

        // removes the amount of UND to burn from _loaned mapping/
        _loaned[account][LLCAddr] = _loaned[account][LLCAddr].sub(toBurn, "ERC20: Overflow Trigger");
        // Removes loan AND fee from user balance
        _balances[account] = _balances[account].sub(toBurn, "ERC20: burn amount exceeds balance");

        // Removes the loan amount of UND from circulation
        _totalSupply = _totalSupply.sub(toBurn);

        // This event could be renamed for easier identification.
        emit Burn(account, LLCAddr, toBurn);
    }

    // Checks how much UND the user has minted (and owes to get liquidity back)
    function checkLoan(address user, address lockLocation) external view returns (uint256 owed) {
        owed = _loaned[user][lockLocation];
    }

    function distributeFee() public returns (bool) {
        require(storedFee > 0, "There is nothing to distribute");

        // amount of fee for safu
        uint256 stakeShare = storedFee.mul(stakeShares).div(100);

        uint256 remainingShare = storedFee.sub(stakeShare);

        // amount of fee for staking
        uint256 safuShare = remainingShare.mul(safuSharesOfStoredFee).div(100);

        // send fee to safu
        _balances[_safuAddr] = _balances[_safuAddr].add(safuShare);

        // send fee to staking
        _balances[_stakeAddr] = _balances[_stakeAddr].add(stakeShare);

        // send remaining fee to the devfund
        _balances[_devFundAddr] = _balances[_devFundAddr].add(remainingShare.sub(safuShare));

        // set the fees to zero
        storedFee = 0;

        return true;
    }

    // onlyOwner Functions

    // change safuShare
    function changeSafuShare(uint256 rate) external onlyOwner {
        require(rate <= 100, "Too big value for Safu Share");
        safuSharesOfStoredFee = rate;
        emit NewSafuShare(rate);
    }

    // change stakeShare
    function changeStakeShare(uint256 rate) external onlyOwner {
        require(rate <= 100, "Too big value for Stake share");
        stakeShares = rate;
        emit NewStakeShare(rate);
    }

    // Changes stakingAddr
    function changeStaking(address newStaking) external onlyOwner {
        require(newStaking != address(0), "Cannot change to 0 address");
        _stakeAddr = newStaking;
        emit NewStaking(newStaking);
    }

    // Changes safuFund
    function changeSafuFund(address newSafuFund) external onlyOwner {
        require(newSafuFund != address(0), "Cannot change to 0 address");
        _safuAddr = newSafuFund;
        emit NewSafu(newSafuFund);
    }

    // Changes devFund
    function changeDevFund(address newDevFund) external onlyOwner {
        require(newDevFund != address(0), "Cannot change to 0 address");
        _devFundAddr = newDevFund;
        emit NewDevFund(newDevFund);
    }

    // Changes Valuator Contract Address
    function changeValuator(address newValuator) external onlyOwner {
        require(newValuator != address(0), "Cannot change to 0 address");
        _valuator = newValuator;
        emit NewValuator(newValuator);
    }

    // Checks if sender is owner
    function isOwner() public view returns (bool) {
        return msg.sender == _owner;
    }

    // Changes owner (part 1)
    function setOwner(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Cannot change to 0 address");
        _ownerPending = _newOwner;
        _isPending = true;
        emit ChangingAdmin(msg.sender, _newOwner);
    }

    // changes owner (part 2)
    function claimOwner() external {
        require(_isPending, "Change was not initialized");
        require(_ownerPending == msg.sender, "You are not pending owner");
        _owner = _ownerPending;
        _isPending = false;
        emit AdminChanged(msg.sender);
    }

    // Claim - remove any airdropped tokens
    // currently sends all tokens to "to" address (in param)
    function claimTokens(address _tokenAddr, address to) external onlyOwner {
        uint256 tokenBal = IERC20(_tokenAddr).balanceOf(address(this));
        require(IERC20(_tokenAddr).transfer(to, tokenBal), "UND: misc. Token Transfer Failed");
    }
}
