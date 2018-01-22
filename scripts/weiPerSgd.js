let BigNumber = require('bignumber.js');

contract('sgd', function(accounts) {
    it("should calc wei per sgd globals", function() {
        let weiPerEther = (new BigNumber(10).pow(18));
        let ethToUsd = 1110;
        let sgdToUsd = 0.756962;
        let weiPerSgd = weiPerEther.div(ethToUsd).mul(sgdToUsd);
        console.log("wei per SGD: " + weiPerSgd.valueOf());
    });
});