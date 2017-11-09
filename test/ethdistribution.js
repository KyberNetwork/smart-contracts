
var sendEtherWithPromise = function( sender, recv, amount ) {
    return new Promise(function(fulfill, reject){
            web3.eth.sendTransaction({to: recv, from: sender, value: amount}, function(error, result){
            if( error ) {
                return reject(error);
            }
            else {
                return fulfill(true);
            }
        });
    });
};

var nam = "0xc6bc2f7b73da733366985f5f5b485262b45a77a3";
var victor = "0x760d30979eb313a2d23c53e4fb55986183b0ffd9";
var duc = "0x25B8b1F2c21A70B294231C007e834Ad2de04f51F";

var amount = 10**10 * 10 **18;

contract('Scenario One', function(accounts) {

  beforeEach(function(done){
    done();
  });
  afterEach(function(done){
    done();
  });


  it("send to victor", function() {
      return sendEtherWithPromise(accounts[0],victor,amount);
  });
  it("send to duc", function() {
      return sendEtherWithPromise(accounts[0],duc,amount);
  });
  it("send to nam", function() {
      return sendEtherWithPromise(accounts[0],nam,amount);
  });


});
