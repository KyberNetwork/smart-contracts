const MakerOrders = artifacts.require("./permissionless/mock/MockMakerOrders.sol");
const TestToken = artifacts.require("./mockContracts/TestToken.sol");

let makerOrders;

const howMany = 200;
const firstOrderId = 9;

contract("MakerOrders", async(accounts) => {

    beforeEach("create contract", async() => {
        makerOrders = await MakerOrders.new();
        await makerOrders.allocateNewOrders(howMany, firstOrderId);
    });

    it("get order allocation data. verify values", async() => {
        let rxHowMany = await makerOrders.getNumOrders();
        assert.equal (rxHowMany.valueOf(), howMany);

        let rxFirstId = await makerOrders.getFirstOrderId();
        assert.equal (rxFirstId.valueOf(), firstOrderId);

        let takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 0);
    });

    it("verify taken bitmap reflects new allocations", async() => {
        let takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 0);

        await makerOrders.getNewOrder();
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        assert.equal(takenBitMap, 1);

        await makerOrders.getNewOrder();
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        assert.equal(takenBitMap, 3);

        await makerOrders.getNewOrder();
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        assert.equal(takenBitMap, 7);


        await makerOrders.getNewOrder();
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
//        log("taken bit map: " + takenBitMap)
        assert.equal(takenBitMap, 15);
    })

    it("verify taken bitmap reflects releasing IDs", async() => {
        for (let i = 0; i < 4; i++) {
            await makerOrders.getNewOrder();
        }

        let takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 15);

        let orderToRelease = firstOrderId;

        await makerOrders.releaseOrder(orderToRelease);
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 14);

        await makerOrders.releaseOrder(++orderToRelease);
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 12);

        await makerOrders.releaseOrder(++orderToRelease);
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 8);

        await makerOrders.releaseOrder(++orderToRelease);
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 0);
    })


    it("verify taken bitmap reflects reusing IDs", async() => {
        for (let i = 0; i < 4; i++) {
            await makerOrders.getNewOrder();
        }

        let takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 15);

        let orderToRelease = firstOrderId;

        await makerOrders.releaseOrder(orderToRelease);
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 14);

        await makerOrders.getNewOrder();
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 15);

        await makerOrders.releaseOrder(orderToRelease);
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 14);

        await makerOrders.releaseOrder(++orderToRelease);
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 12);

        await makerOrders.getNewOrder();
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 13);

        await makerOrders.getNewOrder();
        takenBitMap = await makerOrders.getTakenOrdersBitMap();
        assert.equal(takenBitMap, 15);
    })

    it("verify allocated ID as expected for fresh new (not reused) orders", async() => {
        let rc = await makerOrders.getNewOrder();
//        console.log(rc.logs[0].args.orderId.valueOf())
        let rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, firstOrderId);

        rc = await makerOrders.getNewOrder();
//        console.log(rc.logs[0].args.orderId.valueOf())
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, (firstOrderId + 1));

        rc = await makerOrders.getNewOrder();
//        console.log(rc.logs[0].args.orderId.valueOf())
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, (firstOrderId + 2));
    })

    it("verify allocated reused ID as expected (from start)", async() => {
        for (let i = 0; i < 4; i++) {
            await makerOrders.getNewOrder();
        }

        let orderToRelease = firstOrderId;

        let rc = await makerOrders.releaseOrder(orderToRelease);

        rc = await makerOrders.getNewOrder();
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, orderToRelease);

        await makerOrders.releaseOrder(orderToRelease);
        await makerOrders.releaseOrder(++orderToRelease);

        rc = await makerOrders.getNewOrder();
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, firstOrderId);

        rc = await makerOrders.getNewOrder();
        rxOrderId = rc.logs[0].args.orderId.valueOf();
        assert.equal(rxOrderId, orderToRelease);
    })
})


function log(str) {
    console.log(str);
}
