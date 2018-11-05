const OrderIdManager = artifacts.require("./permissionless/mock/MockOrderIdManager.sol");
const TestToken = artifacts.require("./mockContracts/TestToken.sol");

let orderIdManager;

const howMany = 200;
const firstOrderId = 9;

contract("OrderIdManager", async(accounts) => {

    beforeEach("create contract", async() => {
        orderIdManager = await OrderIdManager.new();
        await orderIdManager.allocateNewOrders(howMany, firstOrderId);
    });

    it("get order allocation data. verify values", async() => {
        let rxHowMany = await orderIdManager.getNumOrders();
        assert.equal (rxHowMany.valueOf(), howMany);

        let rxFirstId = await orderIdManager.getFirstOrderId();
        assert.equal (rxFirstId.valueOf(), firstOrderId);

        let takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 0);
    });

    it("verify taken bitmap reflects new allocations", async() => {
        let takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 0);

        await orderIdManager.getNewOrder();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        assert.equal(takenBitMap, 1);

        await orderIdManager.getNewOrder();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        assert.equal(takenBitMap, 3);

        await orderIdManager.getNewOrder();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        assert.equal(takenBitMap, 7);


        await orderIdManager.getNewOrder();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        assert.equal(takenBitMap, 15);
    })

    it("verify taken bitmap reflects releasing IDs", async() => {
        for (let i = 0; i < 4; i++) {
            await orderIdManager.getNewOrder();
        }

        let takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 15);

        let orderToRelease = firstOrderId;

        await orderIdManager.releaseOrder(orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 14);

        await orderIdManager.releaseOrder(++orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 12);

        await orderIdManager.releaseOrder(++orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 8);

        await orderIdManager.releaseOrder(++orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 0);
    })


    it("verify taken bitmap reflects reusing IDs", async() => {
        for (let i = 0; i < 4; i++) {
            await orderIdManager.getNewOrder();
        }

        let takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 15);

        let orderToRelease = firstOrderId;

        await orderIdManager.releaseOrder(orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 14);

        await orderIdManager.getNewOrder();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 15);

        await orderIdManager.releaseOrder(orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 14);

        await orderIdManager.releaseOrder(++orderToRelease);
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 12);

        await orderIdManager.getNewOrder();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 13);

        await orderIdManager.getNewOrder();
        takenBitMap = await orderIdManager.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 15);
    })

    it("verify allocated ID as expected for fresh new (not reused) orders", async() => {
        let rc = await orderIdManager.getNewOrder();
//        console.log(rc.logs[0].args.orderId.valueOf())
        let rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, firstOrderId);

        rc = await orderIdManager.getNewOrder();
//        console.log(rc.logs[0].args.orderId.valueOf())
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, (firstOrderId + 1));

        rc = await orderIdManager.getNewOrder();
//        console.log(rc.logs[0].args.orderId.valueOf())
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, (firstOrderId + 2));
    })

    it("verify allocated reused ID as expected (from start)", async() => {
        for (let i = 0; i < 4; i++) {
            await orderIdManager.getNewOrder();
        }

        let orderToRelease = firstOrderId;

        let rc = await orderIdManager.releaseOrder(orderToRelease);

        rc = await orderIdManager.getNewOrder();
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, orderToRelease);

        await orderIdManager.releaseOrder(orderToRelease);
        await orderIdManager.releaseOrder(++orderToRelease);

        rc = await orderIdManager.getNewOrder();
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, firstOrderId);

        rc = await orderIdManager.getNewOrder();
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, orderToRelease);
    })

    it("verify allocated reused ID as expected (from start)", async() => {
        for (let i = 0; i < howMany; i++) {
            await orderIdManager.getNewOrder();
        }
    })
})


function log(str) {
    console.log(str);
}
