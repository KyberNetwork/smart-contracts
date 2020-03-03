const OrderIdManager = artifacts.require("MockOrderIdManager.sol");
const TestToken = artifacts.require("TestToken.sol");

const Helper = require("../helper.js");

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
        Helper.assertEqual (rxFirstId, firstOrderId);

        let takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 0);
    });

    it("verify taken bitmap reflects new allocations", async() => {
        let takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 0);

        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        Helper.assertEqual(takenBitMap, 1);

        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        Helper.assertEqual(takenBitMap, 3);

        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        Helper.assertEqual(takenBitMap, 7);


        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        Helper.assertEqual(takenBitMap, 15);
    })

    it("verify taken bitmap reflects releasing IDs", async() => {
        for (let i = 0; i < 4; i++) {
            await orderIdManager.fetchNewOrderId();
        }

        let takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 15);

        let orderToRelease = firstOrderId;

        await orderIdManager.releaseOrderId(orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 14);

        await orderIdManager.releaseOrderId(++orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 12);

        await orderIdManager.releaseOrderId(++orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 8);

        await orderIdManager.releaseOrderId(++orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 0);
    })


    it("verify taken bitmap reflects reusing IDs", async() => {
        for (let i = 0; i < 4; i++) {
            await orderIdManager.fetchNewOrderId();
        }

        let takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 15);

        let orderToRelease = firstOrderId;

        await orderIdManager.releaseOrderId(orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 14);

        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 15);

        await orderIdManager.releaseOrderId(orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 14);

        await orderIdManager.releaseOrderId(++orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 12);

        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 13);

        await orderIdManager.fetchNewOrderId();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        Helper.assertEqual(takenBitMap, 15);
    })

    it("verify allocated ID as expected for fresh new (not reused) orders", async() => {
        let rc = await orderIdManager.fetchNewOrderId();
//        console.log(rc.logs[0].args.orderId)
        let rxOrderId = rc.logs[0].args.orderId;
        Helper.assertEqual(rxOrderId, firstOrderId);

        rc = await orderIdManager.fetchNewOrderId();
//        console.log(rc.logs[0].args.orderId)
        rxOrderId = rc.logs[0].args.orderId;
        Helper.assertEqual(rxOrderId, (firstOrderId + 1));

        rc = await orderIdManager.fetchNewOrderId();
//        console.log(rc.logs[0].args.orderId)
        rxOrderId = rc.logs[0].args.orderId;
        Helper.assertEqual(rxOrderId, (firstOrderId + 2));
    })

    it("check orderAllocationRequired API", async() => {
        let IdManager = await OrderIdManager.new();

        let rc = await IdManager.isOrderAllocationRequired();
        Helper.assertEqual(rc, true);

        await IdManager.allocatOrderIds(firstOrderId);

        rc = await IdManager.isOrderAllocationRequired();
        Helper.assertEqual(rc, false);
    })

    it("verify allocated reused ID as expected (from start)", async() => {
        for (let i = 0; i < 4; i++) {
            await orderIdManager.fetchNewOrderId();
        }

        let orderToRelease = firstOrderId;

        let rc = await orderIdManager.releaseOrderId(orderToRelease);

        rc = await orderIdManager.fetchNewOrderId();
        rxOrderId = rc.logs[0].args.orderId;
        Helper.assertEqual(rxOrderId, orderToRelease);

        await orderIdManager.releaseOrderId(orderToRelease);
        await orderIdManager.releaseOrderId(++orderToRelease);

        rc = await orderIdManager.fetchNewOrderId();
        rxOrderId = rc.logs[0].args.orderId;
        Helper.assertEqual(rxOrderId, firstOrderId);

        rc = await orderIdManager.fetchNewOrderId();
        rxOrderId = rc.logs[0].args.orderId;
        Helper.assertEqual(rxOrderId, orderToRelease);
    })

    it("verify can allocate all Ids without revert", async() => {
        for (let i = 0; i < howMany; i++) {
            let rc =  await orderIdManager.fetchNewOrderId();
            rxOrderId = rc.logs[0].args.orderId;
            Helper.assertEqual(rxOrderId, (firstOrderId * 1 + i * 1));
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
            rxOrderId = rc.logs[0].args.orderId;
            Helper.assertEqual(rxOrderId, (firstOrderId * 1 + i * 1));
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
        rxOrderId = rc.logs[0].args.orderId;

        await orderIdManager.releaseOrderId(rxOrderId);

        try {
            await orderIdManager.releaseOrderId(rxOrderId);
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
            rxOrderId = rc.logs[0].args.orderId;
            Helper.assertEqual(rxOrderId, (firstOrderId * 1 + i * 1));
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
