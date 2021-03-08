const uDai = artifacts.require("UnboundDollar");

module.exports = async (deployer, network, accounts) => {
  let safu = "0x"; // Safu address in the product version
  let devFund = "0x"; // Dev fund address in the product version

  if (network == "development" || network == "test") {
    safu = accounts[1];
    devFund = accounts[2];
  }
  
  await deployer.deploy(uDai, "Unbound Dollar", "UND", safu, devFund);
  
};
