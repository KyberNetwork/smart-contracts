
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

////////////////////////////////////////////////////////////////////////////////

var sendEtherToNam = function( sender, namAddresses, amount ){
  return new Promise(function (fulfill, reject){

      var inputs = [];

      for (var i = 0 ; i < namAddresses.length ; i++ ) {
          inputs.push(namAddresses[i]);
      }

     return inputs.reduce(function (promise, item) {
      return promise.then(function () {
          return sendEtherWithPromise(sender, item, amount);
      });

      }, Promise.resolve()).then(function(){
          fulfill(true);
      }).catch(function(err){
          reject(err);
      });
  });
};

////////////////////////////////////////////////////////////////////////////////

var nam;
var victor_1;
var victor_2;
var victor_3;
var duc;
var spyrus;
var andrew;

var amount = 10**10 * 10 **18;

var parseInput = function( jsonInput ) {

    // special addresses
    var specialAddresses = jsonInput["special addresses"];
    victor_1 = specialAddresses["victor_1"];
    victor_2 = specialAddresses["victor_2"];
    victor_3 = specialAddresses["victor_3"];
    nam = specialAddresses["nam"];
    duc = specialAddresses["duc"];
    spyrus = specialAddresses["spyrus"];
    andrew = specialAddresses["andrew"];
};


contract('Scenario One', function(accounts) {

  beforeEach(function(done){
    done();
  });
  afterEach(function(done){
    done();
  });

  it("read parameters from file", function() {
    var fs = require("fs");
    try{
      var content = JSON.parse(fs.readFileSync("deployment_input.json", 'utf8'));
      parseInput(content);
    }
    catch(err) {
      console.log(err);
      assert.fail(err.toString());
    }

  });

  it("send to victor_1", function() {
      return sendEtherWithPromise(accounts[0],victor_1,amount);
  });
  it("send to victor_2", function() {
      return sendEtherWithPromise(accounts[0],victor_2,amount);
  });
  it("send to victor_3", function() {
    return sendEtherWithPromise(accounts[0],victor_3,amount);
  });
  it("send to duc", function() {
      return sendEtherWithPromise(accounts[0],duc,amount);
  });
  it("send to nam", function() {
      return sendEtherToNam(accounts[0],nam,amount);
  });
  it("send to spyrus", function() {
      return sendEtherWithPromise(accounts[0],spyrus, amount);
  });
  it("send to andrew", function() {
      return sendEtherWithPromise(accounts[0],andrew, amount);
  });



});
