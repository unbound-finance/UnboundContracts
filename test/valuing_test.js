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
const testEth = artifacts.require("TestEth");

contract("Valuing", function (_accounts) {
  // Initial settings
  const owner = _accounts[0];
  const user = _accounts[3];
  const fakeLLC = _accounts[5];
  const loanRate = 500000;
  const feeRate = 5000;

  let und;
  let valueContract;
  let lockContract;
  let tEth;

  //=================
  // Default Functionality
  //=================
  describe("Check functionality", () => {
    before(async function () {
      tEth = await testEth.deployed();
      und = await uDai.deployed();
      valueContract = await valuing.deployed();
      lockContract = await LLC.deployed();
      // Register fake LLC
      await valueContract.addLLC(fakeLLC, und.address, 10, 10);
    });

    it("valuator has correct LLC", async () => {
      let LLCstruct = await valueContract.getLLCStruct(lockContract.address);
      assert.equal(parseInt(LLCstruct.loanrate), loanRate, "incorrect loanRate");
      assert.equal(parseInt(LLCstruct.fee), feeRate, "incorrect feeRate");
    });

    it("cannot call unboundCreate() with 0 amount", async () => {
      const anyNumber = 123;

      await expectRevert(valueContract.unboundCreate(0, owner, anyNumber), "Cannot valuate nothing");
    });

    it("cannot call unboundCreate() on valuator", async () => {
      const anyNumber = 123;
      await expectRevert(valueContract.unboundCreate(20, owner, anyNumber), "LLC not authorized");
    });

    it("cannot call unboundRemove() on valuator", async () => {
      await expectRevert(valueContract.unboundRemove(20, owner), "LLC not authorized");
    });

    it("can claim tokens", async () => {
      await tEth.transfer(valueContract.address, 10);
      await valueContract.claimTokens(tEth.address, user);
      const finalBalance = parseInt(await tEth.balanceOf(user));
      assert.equal(10, finalBalance, "Valuator Claim is not working");
    });

    it("can call changeLoanRate", async () => {
      const rate = 30;
      await valueContract.changeLoanRate(fakeLLC, rate);
      let LLCstruct = await valueContract.getLLCStruct(fakeLLC);
      assert.equal(parseInt(LLCstruct.loanrate), rate, "Changed loan rate is wrong");
    });

    it("can call changeFeeRate", async () => {
      const rate = 30;
      await valueContract.changeFeeRate(fakeLLC, rate);
      let LLCstruct = await valueContract.getLLCStruct(fakeLLC);
      assert.equal(parseInt(LLCstruct.fee), rate, "Changed fee rate is wrong");
    });

    it("can call disableLLC", async () => {
      await valueContract.disableLLC(fakeLLC);
      let LLCstruct = await valueContract.getLLCStruct(fakeLLC);
      assert.equal(parseInt(LLCstruct.loanrate), 0, "Disable loan rate is wrong");
      assert.equal(parseInt(LLCstruct.fee), 0, "Disable fee rate is wrong");
      await expectRevert(valueContract.unboundCreate(10, owner, 10), "LLC not authorized");
    });

    it("cannot claim owner", async () => {
      await expectRevert(valueContract.claimOwner(), "Change was not initialized");
      await valueContract.setOwner(user);
      await expectRevert(valueContract.claimOwner(), "You are not pending owner");
    });

    it("can set owner", async () => {
      await valueContract.claimOwner({ from: user });
      assert.isTrue(await valueContract.isOwner({ from: user }), "Set owner is not working");
      await expectRevert(valueContract.setOwner(owner), "Ownable: caller is not the owner");
    });
  });
});
