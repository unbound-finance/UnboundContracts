/* eslint-disable no-undef */
/*
 * OpenZeppelin Test Helpers
 * https://github.com/OpenZeppelin/openzeppelin-test-helpers
 */
const { BN, constants, balance, expectEvent, expectRevert } = require("@openzeppelin/test-helpers");

/*
 *  ========================================================
 *  Tests of public & external functions in Tier1a contract
 *  ========================================================
 */
const uDai = artifacts.require("UnboundDollar");
const valuing = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_EthDai");
const testDai = artifacts.require("TestDai");
const testEth = artifacts.require("TestEth");
const uniFactory = artifacts.require("UniswapV2Factory");
const uniPair = artifacts.require("UniswapV2Pair");
const router = artifacts.require("UniswapV2Router02");
const testAggregatorEth = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorDai = artifacts.require("TestAggregatorProxyDaiUsd");

contract("UND", function (_accounts) {
  // Initial settings
  const totalSupply = 0;
  const decimal = 10 ** 18;
  const owner = _accounts[0];
  const safu = _accounts[1];
  const devFund = _accounts[2];
  const user = _accounts[3];
  const daiAmount = 400000;
  const rateBalance = 10 ** 6;
  const loanRate = 500000;
  const feeRate = 5000;
  const stakeSharesPercent = 50;
  const safuSharesPercent = 50;
  const zeroAddress = "0x0000000000000000000000000000000000000000";
  const ethPrice = 128093000000;
  const daiPrice = 100275167;

  const base = new BN("1000000000000000000");

  let und;
  let valueContract;
  let lockContract;
  let tDai;
  let tEth;
  let factory;
  let pair;
  let route;
  let storedFeeTotal = 0;
  let stakePair;

  //=================
  // Default Functionality
  //=================
  describe("Check functionality", () => {
    before(async function () {
      tEth = await testEth.deployed();
      tDai = await testDai.deployed();
      route = await router.deployed();
      und = await uDai.deployed();
      valueContract = await valuing.deployed();
      lockContract = await LLC.deployed();
      factory = await uniFactory.deployed();
      pair = await uniPair.at(await lockContract.pair());
      priceFeedEth = await testAggregatorEth.deployed();
      priceFeedDai = await testAggregatorDai.deployed();

      // Set price to aggregator
      await priceFeedEth.setPrice(ethPrice);
      await priceFeedDai.setPrice(daiPrice);

      await tDai.approve(route.address, daiAmount);
      await tEth.approve(route.address, parseInt((daiAmount * daiPrice) / ethPrice));

      let d = new Date();
      let time = d.getTime();
      await route.addLiquidity(
        tDai.address,
        tEth.address,
        daiAmount,
        parseInt((daiAmount * daiPrice) / ethPrice),
        3000,
        10,
        owner,
        parseInt(time / 1000 + 100)
      );

      let stakePool = await factory.createPair(tDai.address, und.address);
      stakePair = await uniPair.at(stakePool.logs[0].args.pair);
      await und.changeStaking(stakePair.address);
    });

    it("should return its name", async () => {
      const retval = await und.name();
      assert.equal(retval, "Unbound Dollar", "Incorrect name");
    });

    it("should return its symbol", async () => {
      const retval = await und.symbol();
      assert.equal(retval, "UND", "Incorrect symbol");
    });

    it("should return its decimals", async () => {
      const retval = await und.decimals();
      assert.equal(parseInt(retval), 18, "Incorrect decimals");
    });

    it("should have 0 as total suply", async () => {
      const retval = await und.totalSupply();
      assert.equal(retval, totalSupply * decimal, "Total suply is not 0");
    });

    it("should have valuator", async () => {
      const retval = await und.valuator();
      assert.equal(retval, valueContract.address, "incorrect Valuator");
    });

    it("should have staking contract address", async () => {
      const retval = await und.stakeAddr();
      assert.equal(retval, stakePair.address, "incorrect staking contract address");
    });

    it("should have emergency fund address", async () => {
      const retval = await und.safuAddr();
      assert.equal(retval, safu, "incorrect emergency fund address");
    });

    it("should have dev fund address", async () => {
      const retval = await und.devFundAddr();
      assert.equal(retval, devFund, "incorrect dev fund address");
    });

    it("should not transfer without balance", async () => {
      const transferAmount = 5;

      await expectRevert(und.transfer(user, transferAmount), "ERC20: transfer amount exceeds balance");
    });

    it("should not transferFrom without balance", async () => {
      const transferAmount = 5;

      await expectRevert(und.transferFrom(user, owner, transferAmount), "ERC20: transfer amount exceeds balance");
    });

    it("should not be able to changeSafuShare more than 100", async () => {
      await expectRevert(und.changeSafuShare(101), "Too big value for Safu Share");
    });

    it("should not be able to changeStakeShare more than 100", async () => {
      await expectRevert(und.changeStakeShare(101), "Too big value for Stake share");
    });

    it("should be able to changeSafuShare", async () => {
      const safuShareTemp = 10;
      await und.changeSafuShare(safuShareTemp);

      const share = await und.safuSharesOfStoredFee();
      assert.equal(parseInt(share), safuShareTemp, "Invalid stake share");

      await und.changeSafuShare(safuSharesPercent);
    });

    it("should be able to changeStakeShare", async () => {
      const stakeShareTemp = 10;
      await und.changeStakeShare(stakeShareTemp);

      const share = await und.stakeShares();
      assert.equal(parseInt(share), stakeShareTemp, "Invalid stake share");

      await und.changeStakeShare(stakeSharesPercent);
    });

    it("should be able to changeSafuFund", async () => {
      const newFund = _accounts[5];
      await und.changeSafuFund(newFund);

      const address = await und.safuAddr();
      assert.equal(address, newFund, "Invalid safu address");

      await und.changeSafuFund(safu);
    });

    it("should be able to changeDevFund", async () => {
      const newFund = _accounts[5];
      await und.changeDevFund(newFund);

      const address = await und.devFundAddr();
      assert.equal(address, newFund, "Invalid dev fund");

      await und.changeDevFund(devFund);
    });

    it("cannot call lockLPT() without enough tokens", async () => {
      const lockAmount = 10;
      const anyNumber = 123;

      await expectRevert(
        lockContract.lockLPT(lockAmount, anyNumber, {
          from: user,
        }),
        "LLC: Insufficient user balance"
      );
    });

    it("cannot call lockLPT() small amount", async () => {
      const lockAmount = 1;
      const anyNumber = 123;

      await pair.approve(lockContract.address, lockAmount);
      await expectRevert(lockContract.lockLPT(lockAmount, anyNumber), "Too small loan value to pay");
    });

    it("fails to lockLPT() with minTokenAmount which is more than minting amount", async () => {
      const LPTbal = await pair.balanceOf(owner);
      const LPtokens = LPTbal.div(new BN("4")); // Amount of token to be lock

      const reserves = await pair.getReserves();
    
      const ethPriceNormalized = (new BN(ethPrice.toString())).mul(new BN("10000000000"));
      
      let ethReserve;
      let ethValue;
      if (reserves._reserve0.toString() === daiAmount.toString()) {
        ethReserve = new BN(reserves._reserve1.toString());
        ethValue = ethReserve.mul(ethPriceNormalized).div(base);
        
      } else {
        ethReserve = new BN(reserves._reserve0.toString());
        ethValue = ethReserve.mul(ethPriceNormalized).div(base);
      }
      

      const totalUSD = (new BN((daiAmount * 100000).toString())).add(ethValue);
      

      const totalLPTokens = await pair.totalSupply.call(); // Total token amount of Liq pool
      const priceOfLp = totalUSD.mul(base).div(totalLPTokens)

      // const oraclePrice = await oracle.latestAnswer();
      // const LPTValueInDai = LPtokens.mul(oraclePrice).div(base);
      const LPTValueInDai = (priceOfLp.mul(LPtokens)).div(base);

      const loanRateBN = new BN(loanRate.toString());
      const feeRateBN = new BN(feeRate.toString());
      const rateBalanceBN = new BN(rateBalance.toString());
      const loanAmount = LPTValueInDai.mul(loanRateBN).div(rateBalanceBN); // Loan amount that user can get
      
      const feeAmount = (loanAmount.mul(feeRateBN).div(rateBalanceBN));
      // const totalUSD = daiAmount * 2; // Total value in Liquidity pool
      // const totalLPTokens = parseInt(await pair.totalSupply()); // Total token amount of Liq pool
      // const LPTValueInDai = parseInt((totalUSD * LPtokens) / totalLPTokens); //% value of Liq pool in Dai
      // const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      // const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee

      await pair.approve(lockContract.address, LPtokens);
      await expectRevert(lockContract.lockLPT(LPtokens, loanAmount.sub(feeAmount).add(new BN("1"))), "Valuing: minting less tokens than minimum amount");
    });

    it("fails to mint zero address", async () => {
      const anyNumber = 123;
      await expectRevert(
        und.mint(zeroAddress, anyNumber, anyNumber, zeroAddress),
        "ERC20: mint to the zero address"
      );
    });

    it("fails to mint by not valuator", async () => {
      const anyNumber = 123;
      await expectRevert(
        und.mint(owner, anyNumber, anyNumber, lockContract.address),
        "Call does not originate from Valuator"
      );
    });

    it("fails to burn zero address", async () => {
      const anyNumber = 123;
      await expectRevert(und.burn(zeroAddress, anyNumber, zeroAddress), "ERC20: burn from the zero address");
    });

    it("fails to burn by not valuator", async () => {
      const anyNumber = 123;
      await expectRevert(und.burn(owner, anyNumber, lockContract.address), "Call does not originate from Valuator");
    });

    it("cannot approve with 0 address", async () => {
      const transferAmount = 10;

      // await expectRevert(und.approve(zeroAddress, transferAmount), 'ERC20: approve from the zero address');
      await expectRevert(und.approve(zeroAddress, transferAmount), "ERC20: approve to the zero address");
    });

    it("cannot transferFrom with 0 address", async () => {
      const transferAmount = 10;

      await expectRevert(und.transferFrom(zeroAddress, user, transferAmount), "ERC20: transfer from the zero address");
      await expectRevert(und.transferFrom(owner, zeroAddress, transferAmount), "ERC20: transfer to the zero address");
    });

    it("mint for test", async () => {
      // Lock some pool token
      await pair.approve(lockContract.address, 1000);
      lockContract.lockLPT(1000, 1);
    });

    it("can transfer", async () => {
      const transferAmount = 10;
      const beforeBal = parseInt(await und.balanceOf(owner));
      const beforeUser = parseInt(await und.balanceOf(user));

      await und.transfer(user, transferAmount);
      const finalBal = parseInt(await und.balanceOf(owner));
      const userBal = parseInt(await und.balanceOf(user));

      assert.equal(userBal, beforeUser + transferAmount, "receiver balance incorrect");
      assert.equal(finalBal, beforeBal - transferAmount, "sender balance incorrect");
    });

    it("can increase and decrease arrowance", async () => {
      const transferAmount = 10;
      const allowanceBefore = parseInt(await und.allowance(user, owner));

      await und.increaseAllowance(owner, transferAmount, { from: user });
      const allowanceIncreased = parseInt(await und.allowance(user, owner));
      assert.equal(allowanceIncreased, allowanceBefore + transferAmount, "increased allowance incorrect");

      await und.decreaseAllowance(owner, transferAmount, { from: user });
      const allowanceDecreased = parseInt(await und.allowance(user, owner));
      assert.equal(allowanceDecreased, allowanceBefore, "decreased allowance incorrect");
    });

    it("can transferFrom", async () => {
      const transferAmount = 10;
      let beforeBal = await und.balanceOf(owner);
      let beforeUser = await und.balanceOf(user);
      beforeBal = parseInt(beforeBal.words[0]);
      beforeUser = parseInt(beforeUser.words[0]);

      await und.approve(owner, transferAmount, { from: user });
      await und.transferFrom(user, owner, transferAmount);
      let finalBal = parseInt(await und.balanceOf(owner));
      let userBal = parseInt(await und.balanceOf(user));

      assert.equal(userBal, beforeUser - transferAmount, "receiver balance incorrect");
      assert.equal(finalBal, beforeBal + transferAmount, "sender balance incorrect");
    });

    it("can claim tokens", async () => {
      await tEth.transfer(und.address, 10);
      await und.claimTokens(tEth.address, user);
      const finalBalance = parseInt(await tEth.balanceOf(user));

      assert.equal(10, finalBalance, "UND Claim is not working");
    });

    it("cannot claim owner", async () => {
      await expectRevert(und.claimOwner(), "Change was not initialized");
      await und.setOwner(user);
      await expectRevert(und.claimOwner(), "You are not pending owner");
    });

    it("can set owner", async () => {
      await und.claimOwner({ from: user });
      assert.isTrue(await und.isOwner({ from: user }), "Set owner is not working");
      await expectRevert(und.setOwner(owner), "Ownable: caller is not the owner");
    });
  });
});
