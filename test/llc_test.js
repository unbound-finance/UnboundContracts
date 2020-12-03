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

contract('LLC', function (_accounts) {
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
  const zeroAddress = '0x0000000000000000000000000000000000000000';

  let und;
  let valueContract;
  let lockContract;
  let tDai;
  let tEth;
  let factory;
  let pair;
  let route;
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
      // Lock some pool
      await pair.approve(lockContract.address, 1000);
      lockContract.lockLPT(1000, 1);
    });

    it('default kill switch', async () => {
      const killSwitch = await lockContract.killSwitch();
      assert.isFalse(killSwitch, 'Default killSwitch incorrect');
    });

    it('can claim tokens', async () => {
      await tEth.transfer(lockContract.address, 10);
      let claim = await lockContract.claimTokens(tEth.address, user);
      let finalBalance = parseInt(await tEth.balanceOf(user));

      assert.equal(10, finalBalance, 'Claim is not working');
    });

    it('cannot claim from its own Liquidity Pool', async () => {
      await pair.transfer(lockContract.address, 10);
      await expectRevert(lockContract.claimTokens(pair.address, user), 'Cannot move LP tokens');
    });

    it('only owner can use disableLock', async () => {
      await expectRevert(lockContract.disableLock({ from: user }), 'Ownable: caller is not the owner');
    });

    it('change kill switch', async () => {
      // Change kill switch
      expectEvent(await lockContract.disableLock(), 'KillSwitch', { position: true });
      assert.isTrue(await lockContract.killSwitch(), 'Changed killSwitch incorrect');

      // Check public functions
      const anyNumber = 123;
      const b32 = web3.utils.asciiToHex('1');

      await expectRevert(lockContract.lockLPTWithPermit(1, 1, b32, b32, b32, anyNumber), 'LLC: This LLC is Deprecated');
      await expectRevert(lockContract.lockLPT(1, anyNumber), 'LLC: This LLC is Deprecated');
      await lockContract.unlockLPT(1); // Be able to unlock under killed status

      // Rechange kill switch
      expectEvent(await lockContract.disableLock(), 'KillSwitch', { position: false });
      assert.isFalse(await lockContract.killSwitch(), 'Changed killSwitch incorrect');
    });

    it('can set owner', async () => {
      await lockContract.setOwner(user);
      assert.isTrue(await lockContract.isOwner({ from: user }), 'Set owner is not working');
      await expectRevert(lockContract.setOwner(user), 'Ownable: caller is not the owner');
      await lockContract.setOwner(owner, { from: user });
    });

    it('can set valuing address', async () => {
      const newValuing = new valuing(und.address);
      const beforeBalance = parseInt(await und.balanceOf(owner));

      await lockContract.setValuingAddress(newValuing.address);
      await pair.approve(lockContract.address, 1000);
      lockContract.lockLPT(1000, 1);

      const balance = parseInt(await und.balanceOf(owner));
      assert.equal(balance, beforeBalance, 'valuing address is incorrect');
    });
  });
});
