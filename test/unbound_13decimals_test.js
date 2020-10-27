/* eslint-disable no-undef */
/*
 * OpenZeppelin Test Helpers
 * https://github.com/OpenZeppelin/openzeppelin-test-helpers
 */
const { BN, constants, balance, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

/*
 *  ========================================================
 *  Tests of public & external functions in Tier1a contract
 *  ========================================================
 */
const uDai = artifacts.require('UnboundDollar');
const valuing = artifacts.require('Valuing_01');
const LLC = artifacts.require('LLC_EthDai');
const testDai = artifacts.require('TestDai13');
const testEth = artifacts.require('TestEth');
const uniFactory = artifacts.require('UniswapV2Factory');
const uniPair = artifacts.require('UniswapV2Pair');

const weth9 = artifacts.require('WETH9');

const router = artifacts.require('UniswapV2Router02');

contract('unboundSystem decimals13', function (_accounts) {
  // Initial settings
  const totalSupply = 0;
  const decimal = 10 ** 18;
  const stablecoinDecimal = 10 ** 13;
  const amount = 0;
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

  let unboundDai;
  let valueContract;
  let lockContract;
  let tDai;
  let tEth;
  let weth;
  let factory;
  let pair;
  let route;
  let lockedTokens;
  let storedFee = 0;

  /////////
  let stakePair;

  //=================
  // Default Functionality
  //=================
  describe('Check default functionality', () => {
    before(async function () {
      unboundDai = await uDai.deployed();
      valueContract = await valuing.deployed();

      factory = await uniFactory.deployed();
      tEth = await testEth.deployed();
      tDai = await testDai.deployed();
      // lockContract = await LLC.deployed();
      weth = await weth9.deployed();
      route = await router.deployed();

      const pairAddr = await factory.createPair(tDai.address, tEth.address);
      pair = await uniPair.at(pairAddr.logs[0].args.pair);

      lockContract = await LLC.new(valueContract.address, pairAddr.logs[0].args.pair, tDai.address);

      let permissionLLC = await valueContract.addLLC(lockContract.address, loanRate, feeRate);
      let permissionUdai = await valueContract.allowToken(unboundDai.address);

      let newValuator = await unboundDai.changeValuator(valueContract.address);

      let approveTdai = await tDai.approve(route.address, 400000);
      let approveTeth = await tEth.approve(route.address, 1000);

      let d = new Date();
      let time = d.getTime();
      let addLiq = await route.addLiquidity(
        tDai.address,
        tEth.address,
        daiAmount,
        1000,
        3000,
        10,
        owner,
        parseInt(time / 1000 + 100)
      );

      let stakePool = await factory.createPair(tDai.address, unboundDai.address);
      stakePair = await uniPair.at(stakePool.logs[0].args.pair);

      await unboundDai.changeStaking(stakePair.address);
    });

    //=== UnboundDai ===//
    it('UND should have 0 as total suply', async () => {
      const retval = await unboundDai.totalSupply.call();
      assert.equal(retval, totalSupply * decimal, 'Total suply is not 0');
    });

    it('UND should have valuator', async () => {
      const retval = await unboundDai.valuator.call();
      assert.equal(retval, valueContract.address, 'incorrect Valuator');
    });

    it('UND should have staking contract address', async () => {
      const retval = await unboundDai.stakeAddr.call();
      assert.equal(retval, stakePair.address, 'incorrect staking contract address');
    });

    it('UND should have emergency fund address', async () => {
      const retval = await unboundDai.safuAddr.call();
      assert.equal(retval, safu, 'incorrect emergency fund address');
    });

    it('UND should have dev fund address', async () => {
      const retval = await unboundDai.devFundAddr.call();
      assert.equal(retval, devFund, 'incorrect dev fund address');
    });

    it('UND should not transfer', async () => {
      const transferAmount = 5;

      await expectRevert(unboundDai.transfer(user, transferAmount), 'ERC20: transfer amount exceeds balance');
    });

    it('UND should not transferFrom', async () => {
      const transferAmount = 5;

      await expectRevert(
        unboundDai.transferFrom(user, owner, transferAmount),
        'ERC20: transfer amount exceeds balance'
      );
    });

    it('UND should be not auto fee distribution', async () => {
      assert.isFalse(await unboundDai.autoFeeDistribution(), 'incorrect autoFeeDistribution');
    });

    it('UND should be able to change autoFeeDistribution', async () => {
      await unboundDai.flipFeeDistribution();

      assert.isTrue(await unboundDai.autoFeeDistribution(), 'incorrect autoFeeDistribution');
    });

    //=== LLC ===//
    it('valuator has correct LLC', async () => {
      let LLCstruct = await valueContract.getLLCStruct.call(lockContract.address);
      assert.equal(LLCstruct.loanrate.words[0], loanRate, 'incorrect loanRate');
      assert.equal(LLCstruct.fee.words[0], feeRate, 'incorrect feeRate');
    });

    it('cannot call unboundCreate() on valuator', async () => {
      const anyNumber = 123;
      await expectRevert(valueContract.unboundCreate(20, owner, unboundDai.address, anyNumber), 'LLC not authorized');
    });

    it('cannot call lockLPT() without enough tokens', async () => {
      const lockAmount = 10;
      const anyNumber = 123;

      await expectRevert(
        lockContract.lockLPT(lockAmount, unboundDai.address, anyNumber, {
          from: user,
        }),
        'LLC: Insufficient LPTs'
      );
    });

    // This never happen in 13 decimals
    // it("cannot call lockLPT() small amount", async () => {
    //   const lockAmount = 1;

    //   let approveLP = await pair.approve(
    //     lockContract.address,
    //     lockAmount
    //   );
    //   await expectRevert(
    //     lockContract.lockLPT(lockAmount, unboundDai.address),
    //     "amount is too small"
    //   );
    // });

    it('UND mint - first', async () => {
      const LPTbal = parseInt(await pair.balanceOf.call(owner));
      const LPtokens = parseInt(LPTbal / 4); // Amount of token to be lock
      lockedTokens = LPtokens;
      const totalUSD = daiAmount * 2; // Total value in Liquidity pool

      const totalLPTokens = parseInt(await pair.totalSupply.call()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt(((totalUSD * LPtokens) / totalLPTokens) * (decimal / stablecoinDecimal)); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee
      const stakingAmount = parseInt((feeAmount * stakeSharesPercent) / 100);

      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens, unboundDai.address, loanAmount - feeAmount);
      const ownerBal = parseInt(await unboundDai.balanceOf.call(owner));
      const stakingBal = parseInt(await unboundDai.balanceOf.call(stakePair.address));

      assert.equal(ownerBal, loanAmount - feeAmount, 'owner balance incorrect');
      assert.equal(stakingBal, stakingAmount, 'staking balance incorrect');
      console.log(`staking: ${stakingAmount}`);
      storedFee += feeAmount - stakingAmount;

      let tokenBal0 = parseInt(await unboundDai.checkLoan.call(owner, lockContract.address));

      assert.equal(tokenBal0, loanAmount, 'loan amount incorrect');
    });

    it('UND mint - second', async () => {
      let LPTbal = await pair.balanceOf.call(owner);
      let LPtokens = parseInt(LPTbal.words[0] / 3);

      const totalUSD = daiAmount * 2; // Total value in Liquidity pool
      const totalLPTokens = parseInt(await pair.totalSupply.call()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt(((totalUSD * LPtokens) / totalLPTokens) * (decimal / stablecoinDecimal)); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee
      const stakingAmount = parseInt((feeAmount * stakeSharesPercent) / 100);

      // second mint
      let approveLP = await pair.approve(lockContract.address, LPtokens);
      let mint0 = await lockContract.lockLPT(LPtokens, unboundDai.address, loanAmount - feeAmount);
      let newBal = await pair.balanceOf.call(owner);
      assert.equal(newBal, LPTbal - LPtokens, 'valuing incorrect');
      console.log(`staking: ${stakingAmount}`);
      storedFee += feeAmount - stakingAmount;
    });

    it('UND burn', async () => {
      let uDaiBal = await unboundDai.balanceOf.call(owner);
      uDaiBal = uDaiBal.words[0];
      let tokenBal4 = await unboundDai.checkLoan.call(owner, lockContract.address);

      let LPTbal = await pair.balanceOf.call(owner);
      let LPtokens = parseInt(LPTbal.words[0]);
      let tokenBal0 = await unboundDai.balanceOf.call(owner);

      // burn
      let burn = await lockContract.unlockLPT(lockedTokens, unboundDai.address);
      let tokenBal1 = await unboundDai.balanceOf.call(owner);
      let newBal = parseInt(await pair.balanceOf.call(owner));

      assert.equal(newBal, LPtokens + lockedTokens, 'valuing incorrect');
    });

    it('UND can transfer', async () => {
      const transferAmount = 10;
      let beforeBal = await unboundDai.balanceOf.call(owner);
      let beforeUser = await unboundDai.balanceOf.call(user);
      beforeBal = parseInt(beforeBal.words[0]);
      beforeUser = parseInt(beforeUser.words[0]);

      let theTransfer = await unboundDai.transfer(user, transferAmount);
      let finalBal = await unboundDai.balanceOf.call(owner);
      let userBal = await unboundDai.balanceOf.call(user);
      finalBal = parseInt(finalBal.words[0]);
      userBal = parseInt(userBal.words[0]);

      assert.equal(userBal, beforeUser + transferAmount, 'receiver balance incorrect');
      assert.equal(finalBal, beforeBal - transferAmount, 'sender balance incorrect');
    });

    it('UND can distribute the fee to safu and devFund', async () => {
      const beforeStoredFee = parseInt(await unboundDai.storedFee.call());
      assert.equal(beforeStoredFee, storedFee, 'incorrect before stored fee');

      const beforeSafuBal = parseInt(await unboundDai.balanceOf.call(safu));
      const beforeDevFundBal = parseInt(await unboundDai.balanceOf.call(devFund));
      const safuShare = parseInt((storedFee * safuSharesPercent) / 100);

      await unboundDai.distributeFee({ from: user });

      const afterSafuBal = parseInt(await unboundDai.balanceOf.call(safu));
      const afterDevFundBal = parseInt(await unboundDai.balanceOf.call(devFund));
      const afterStoredFee = parseInt(await unboundDai.storedFee.call());

      assert.equal(afterSafuBal, beforeSafuBal + safuShare, 'incorrect safu balance');
      console.log(`safa: ${safuShare}`);
      assert.equal(afterDevFundBal, beforeDevFundBal + storedFee - safuShare, 'incorrect dev fund balance');
      console.log(`devFund: ${storedFee - safuShare}`);
      storedFee = 0;
      assert.equal(afterStoredFee, storedFee, 'incorrect stored fee');
    });

    it('LLC can claim tokens', async () => {
      let sendEth = await tEth.transfer(lockContract.address, 10);
      let claim = await lockContract.claimTokens(tEth.address, user);
      let finalBalance = await tEth.balanceOf.call(user);

      assert.equal(10, finalBalance.words[0], 'Claim is not working');
    });

    it('LLC cannot claim from its own Liquidity Pool', async () => {
      let sendEth = await tEth.transfer(lockContract.address, 10);
      await expectRevert(lockContract.claimTokens(pair.address, user), 'Cannot move LP tokens');
    });

    it("LLC - other user can't pay off someone elses loan", async () => {
      let LPTbal = await pair.balanceOf.call(owner);
      let LPtokens = parseInt(LPTbal.words[0] / 3);
      const totalUSD = daiAmount * 2; // Total value in Liquidity pool
      const totalLPTokens = parseInt(await pair.totalSupply.call()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt(((totalUSD * LPtokens) / totalLPTokens) * (decimal / stablecoinDecimal)); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee

      // first mint
      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens, unboundDai.address, loanAmount - feeAmount);

      // user A balance before
      let tokenBal = await unboundDai.balanceOf.call(owner);
      tokenBal = parseInt(tokenBal.words[0] / 4);

      // user B balance before
      let beforeSafuBal = await unboundDai.balanceOf.call(user);
      beforeSafuBal = beforeSafuBal.words[0];

      // transfer funds to other user
      let moveUND = await unboundDai.transfer(user, tokenBal);

      // Trys to unlockLPT with User B
      await expectRevert(
        lockContract.unlockLPT(LPtokens, unboundDai.address, {
          from: user,
        }),
        'Insufficient liquidity locked'
      );
    });
  });
});
