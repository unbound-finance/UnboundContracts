const uDai = artifacts.require("UnboundDollar");

module.exports = async (deployer, network, accounts) => {
  let safu = "0x22CB224F9FA487dCE907135B57C779F1f32251D4"; // Safu address in the product version
  let devFund = "0x22CB224F9FA487dCE907135B57C779F1f32251D4"; // Dev fund address in the product version

  if (network == "development" || network == "test") {
    safu = accounts[1];
    devFund = accounts[2];
  }
  
  await deployer.deploy(uDai, "Unbound Dollar", "UND", safu, devFund);
  
};
