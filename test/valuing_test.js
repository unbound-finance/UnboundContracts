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
const testDai = artifacts.require('TestDai');
const testEth = artifacts.require('TestEth');
const uniFactory = artifacts.require('UniswapV2Factory');
const uniPair = artifacts.require('UniswapV2Pair');
const weth9 = artifacts.require('WETH9');
const router = artifacts.require('UniswapV2Router02');

contract('Valuing', function (_accounts) {
  // Initial settings
  const totalSupply = 0;
  const decimal = 10 ** 18;
  const owner = _accounts[0];
  const safu = _accounts[1];
  const devFund = _accounts[2];
  const user = _accounts[3];
  const fakeLLC = _accounts[5];
  const daiAmount = 400000;
  const rateBalance = 10 ** 6;
  const loanRate = 500000;
  const feeRate = 5000;
  const stakeSharesPercent = 50;
  const safuSharesPercent = 50;
  const zeroAddress = '0x0000000000000000000000000000000000000000';

  let und;
  let valueContract;
  let lockContract;
  let tDai;
  let tEth;
  let weth;
  let factory;
  let pair;
  let route;
  let burnTokens;
  let storedFeeTotal = 0;
  let stakePair;

  //=================
  // Default Functionality
  //=================
  describe('Check functionality', () => {
    before(async function () {
      tEth = await testEth.deployed();
      tDai = await testDai.deployed();
      route = await router.deployed();
      und = await uDai.deployed();
      valueContract = await valuing.deployed();
      lockContract = await LLC.deployed();
      factory = await uniFactory.deployed();
      pair = await uniPair.at(await lockContract.pair());

      await tDai.approve(route.address, 400000);
      await tEth.approve(route.address, 1000);

      let d = new Date();
      let time = d.getTime();
      await route.addLiquidity(
        tDai.address,
        tEth.address,
        daiAmount,
        1000,
        3000,
        10,
        owner,
        parseInt(time / 1000 + 100)
      );

      let stakePool = await factory.createPair(tDai.address, und.address);
      stakePair = await uniPair.at(stakePool.logs[0].args.pair);
      await und.changeStaking(stakePair.address);
      // Register fake LLC
      await valueContract.addLLC(fakeLLC, 10, 10);
    });

    it('valuator has correct LLC', async () => {
      let LLCstruct = await valueContract.getLLCStruct(lockContract.address);
      assert.equal(parseInt(LLCstruct.loanrate), loanRate, 'incorrect loanRate');
      assert.equal(parseInt(LLCstruct.fee), feeRate, 'incorrect feeRate');
    });

    it('cannot call unboundCreate() with 0 amount', async () => {
      const anyNumber = 123;

      await expectRevert(valueContract.unboundCreate(0, owner, und.address, anyNumber), 'Cannot valuate nothing');
    });

    it('cannot call unboundCreate() on valuator', async () => {
      const anyNumber = 123;
      await expectRevert(valueContract.unboundCreate(20, owner, und.address, anyNumber), 'LLC not authorized');
    });

    it('cannot call unboundCreate() with wrong token address', async () => {
      const anyNumber = 123;
      await expectRevert(
        valueContract.unboundCreate(20, owner, _accounts[5], anyNumber, { from: fakeLLC }),
        'invalid unbound contract'
      );
    });

    it('cannot call unboundRemove() on valuator', async () => {
      const anyNumber = 123;
      await expectRevert(valueContract.unboundCreate(20, owner, und.address, anyNumber), 'LLC not authorized');
    });

    it('cannot call unboundRemove() with wrong token address', async () => {
      const anyNumber = 123;
      await expectRevert(
        valueContract.unboundCreate(20, owner, _accounts[5], anyNumber, { from: fakeLLC }),
        'invalid unbound contract'
      );
    });

    it('can claim tokens', async () => {
      await tEth.transfer(valueContract.address, 10);
      await valueContract.claimTokens(tEth.address, user);
      const finalBalance = parseInt(await tEth.balanceOf(user));
      assert.equal(10, finalBalance, 'Valuator Claim is not working');
    });

    it('can call changeLoanRate', async () => {
      const rate = 30;
      await valueContract.changeLoanRate(fakeLLC, rate);
      let LLCstruct = await valueContract.getLLCStruct(fakeLLC);
      assert.equal(parseInt(LLCstruct.loanrate), rate, 'Changed loan rate is wrong');
    });

    it('can call changeFeeRate', async () => {
      const rate = 30;
      await valueContract.changeFeeRate(fakeLLC, rate);
      let LLCstruct = await valueContract.getLLCStruct(fakeLLC);
      assert.equal(parseInt(LLCstruct.fee), rate, 'Changed fee rate is wrong');
    });

    it('can call disableLLC', async () => {
      await valueContract.disableLLC(fakeLLC);
      let LLCstruct = await valueContract.getLLCStruct(fakeLLC);
      assert.equal(parseInt(LLCstruct.loanrate), 0, 'Disable loan rate is wrong');
      assert.equal(parseInt(LLCstruct.fee), 0, 'Disable fee rate is wrong');
      await expectRevert(valueContract.unboundCreate(10, owner, und.address, 10), 'LLC not authorized');
    });

    it('can set owner', async () => {
      await valueContract.setOwner(user);
      assert.isTrue(await valueContract.isOwner({ from: user }), 'Set owner is not working');
      await expectRevert(valueContract.setOwner(user), 'Ownable: caller is not the owner');
    });
  });
});
