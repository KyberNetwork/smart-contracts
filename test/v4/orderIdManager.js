const OrderIdManager = artifacts.require("./permissionless/mock/MockOrderIdManager.sol");
const TestToken = artifacts.require("./mockContracts/TestToken.sol");

const Helper = require("./helper.js");

let orderIdManager;

const firstOrderId = 9;
let howMany;

contract("OrderIdManager", async(accounts) => {

    beforeEach("create contract", async() => {
        orderIdManager = await OrderIdManager.new();
        await orderIdManager.allocatOrderIds(firstOrderId);
    });

    it("get order allocation data. verify values", async() => {
        howMany = await orderIdManager.NUM_ORDERS();

        let rxFirstId = await orderIdManager.getFirstOrderId();
        assert.equal (rxFirstId.valueOf(), firstOrderId);

        let takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 0);
    });

    it("verify taken bitmap reflects new allocations", async() => {
        let takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 0);

        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        assert.equal(takenBitMap, 1);

        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        assert.equal(takenBitMap, 3);

        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        assert.equal(takenBitMap, 7);


        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        assert.equal(takenBitMap, 15);
    })

    it("verify taken bitmap reflects releasing IDs", async() => {
        for (let i = 0; i < 4; i++) {
            await orderIdManager.fetchNewOrderId();
        }

        let takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 15);

        let orderToRelease = firstOrderId;

        await orderIdManager.releaseOrderId(orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 14);

        await orderIdManager.releaseOrderId(++orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 12);

        await orderIdManager.releaseOrderId(++orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 8);

        await orderIdManager.releaseOrderId(++orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 0);
    })


    it("verify taken bitmap reflects reusing IDs", async() => {
        for (let i = 0; i < 4; i++) {
            await orderIdManager.fetchNewOrderId();
        }

        let takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 15);

        let orderToRelease = firstOrderId;

        await orderIdManager.releaseOrderId(orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 14);

        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 15);

        await orderIdManager.releaseOrderId(orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 14);

        await orderIdManager.releaseOrderId(++orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 12);

        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 13);

        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 15);
    })

    it("verify allocated ID as expected for fresh new (not reused) orders", async() => {
        let rc = await orderIdManager.fetchNewOrderId();
//        console.log(rc.logs[0].args.orderId.valueOf())
        let rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, firstOrderId);

        rc = await orderIdManager.fetchNewOrderId();
//        console.log(rc.logs[0].args.orderId.valueOf())
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, (firstOrderId + 1));

        rc = await orderIdManager.fetchNewOrderId();
//        console.log(rc.logs[0].args.orderId.valueOf())
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, (firstOrderId + 2));
    })

    it("check orderAllocationRequired API", async() => {
        let IdManager = await OrderIdManager.new();

        let rc = await IdManager.isOrderAllocationRequired();
        assert.equal(rc.valueOf(), true);

        await IdManager.allocatOrderIds(firstOrderId);

        rc = await IdManager.isOrderAllocationRequired();
        assert.equal(rc.valueOf(), false);
    })

    it("verify allocated reused ID as expected (from start)", async() => {
        for (let i = 0; i < 4; i++) {
            await orderIdManager.fetchNewOrderId();
        }

        let orderToRelease = firstOrderId;

        let rc = await orderIdManager.releaseOrderId(orderToRelease);

        rc = await orderIdManager.fetchNewOrderId();
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, orderToRelease);

        await orderIdManager.releaseOrderId(orderToRelease);
        await orderIdManager.releaseOrderId(++orderToRelease);

        rc = await orderIdManager.fetchNewOrderId();
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, firstOrderId);

        rc = await orderIdManager.fetchNewOrderId();
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, orderToRelease);
    })

    it("verify can allocate all Ids without revert", async() => {
        for (let i = 0; i < howMany; i++) {
            let rc =  await orderIdManager.fetchNewOrderId();
            rxOrderId = rc.logs[0].args.orderId.valueOf();
            assert.equal(rxOrderId.valueOf(), (firstOrderId * 1 + i * 1));
        }
    })

    it("verify can allocate orders only if not allocated before.", async() => {
        try {
             let rc =  await orderIdManager.allocatOrderIds(firstOrderId);
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    })

    it("verify when allocating ID after all are used, reverts", async() => {
        for (let i = 0; i < howMany; i++) {
            let rc =  await orderIdManager.fetchNewOrderId();
            rxOrderId = rc.logs[0].args.orderId.valueOf();
            assert.equal(rxOrderId.valueOf(), (firstOrderId * 1 + i * 1));
        }

        try {
             let rc =  await orderIdManager.fetchNewOrderId();
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    })

    it("verify when releasing order ID that wan't allocated -> reverts", async() => {
        let rc =  await orderIdManager.fetchNewOrderId();
        rxOrderId = rc.logs[0].args.orderId.valueOf();

        await orderIdManager.releaseOrderId(rxOrderId.valueOf());

        try {
            await orderIdManager.releaseOrderId(rxOrderId.valueOf());
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    })

    it("verify when releasing order ID out of allocation boundaries -> reverts", async() => {
        let maxOrderId = firstOrderId * 1 + howMany * 1 - 1;
        let minOrderId = firstOrderId;
        let aboveMax = maxOrderId * 1 + 1 * 1;
        belowMin =  firstOrderId * 1 - 1 * 1;

        for (let i = 0; i < howMany; i++) {
            let rc =  await orderIdManager.fetchNewOrderId();
            rxOrderId = rc.logs[0].args.orderId.valueOf();
            assert.equal(rxOrderId.valueOf(), (firstOrderId * 1 + i * 1));
        }

        try {
            await orderIdManager.releaseOrderId(aboveMax);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see that in boundaries can release
        await orderIdManager.releaseOrderId(maxOrderId);

        try {
            await orderIdManager.releaseOrderId(belowMin);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see that in boundaries can release
        await orderIdManager.releaseOrderId(minOrderId);
    })
})


function log(str) {
    console.log(str);
}
