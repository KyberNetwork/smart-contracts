const BN = web3.utils.BN;

require("chai")
    .use(require("chai-as-promised"))
    .should()

const Helper = require("../helper.js");

const OrderList = artifacts.require("OrderList.sol");

const zeroAddress = '0x0000000000000000000000000000000000000000';
const zeroBN = new BN(0);
const precision = new BN(10).pow(new BN(18));

let user1;
let user2;

let orders;

let HEAD_ID;
let TAIL_ID;

contract('OrderList', async (accounts) => {
    before('setup accounts', async () => {
        user1 = accounts[0];
        user2 = accounts[1];
    });

    beforeEach('setup contract for each test', async () => {
        orders = await OrderList.new(user1);
        HEAD_ID = await orders.HEAD_ID();
        TAIL_ID = await orders.TAIL_ID();
    });

    describe("basic", async () => {
        it("should have different ids for head and tail", async () => {
            HEAD_ID.should.be.bignumber.not.equal(TAIL_ID);
        });

        it("head should initially point to tail as its nextId", async () => {
            const head = await getOrderById(HEAD_ID);

            head.nextId.should.be.bignumber.equal(TAIL_ID);
        });

        it("should not allow deploying with address 0 as admin", async () => {
            try {
                await OrderList.new(zeroAddress);
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(
                    Helper.isRevertErrorMessage(e),
                    "expected revert but got: " + e);
            }
        });
    });

    describe("#allocateIds", async () => {
        it("should return ids different from head and tail", async () => {
            const firstId = await allocateIds(1);

            firstId.should.be.bignumber.not.equal(HEAD_ID);
            firstId.should.be.bignumber.not.equal(TAIL_ID);
        });

        it("should allocate different ids for orders", async () => {
            let firstAllocationfirstId = (await allocateIds(3)).toNumber();
            let secondAllocationfirstId = (await allocateIds(3)).toNumber();

            let firstAllocationIds = new Set([
                firstAllocationfirstId,
                firstAllocationfirstId + 1,
                firstAllocationfirstId + 2
            ]);

            let secondAllocationIds = new Set([
                secondAllocationfirstId,
                secondAllocationfirstId + 1,
                secondAllocationfirstId + 2
            ]);

            firstAllocationIds.should.not.have.any.keys(Array.from(secondAllocationIds));
            secondAllocationIds.should.not.have.any.keys(Array.from(firstAllocationIds));
        });

        it("should allocate different ids for orders of different sizes", async () => {
            let firstAllocationfirstId = (await allocateIds(5)).toNumber();
            let secondAllocationfirstId = (await allocateIds(3)).toNumber();

            let firstAllocationIds = new Set([
                firstAllocationfirstId,
                firstAllocationfirstId + 1,
                firstAllocationfirstId + 2,
                firstAllocationfirstId + 3,
                firstAllocationfirstId + 4
            ]);

            let secondAllocationIds = new Set([
                secondAllocationfirstId,
                secondAllocationfirstId + 1,
                secondAllocationfirstId + 2
            ]);

            firstAllocationIds.should.not.have.any.keys(Array.from(secondAllocationIds));
            secondAllocationIds.should.not.have.any.keys(Array.from(firstAllocationIds));
        });

        it("should reach over flow in nextFreeId, see revert", async() => {
            let maxUint32 = (new BN(2)).pow(new BN(32));
            let nextFreeId = await orders.nextFreeId();

            await orders.allocateIds(maxUint32.sub(nextFreeId).sub(new BN(1)));

            try {
                await orders.allocateIds(2);
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(
                    Helper.isRevertErrorMessage(e),
                    "expected revert but got: " + e);
            }
        })
    });

    describe("#compareOrders", async () => {
        it("compare orders: order1 better than order2 -> negative", async () => {
            const orderComparison = await orders.compareOrders.call(
                10 /* srcAmount1 */,
                100 /* dstAmount1 */,
                10 /* srcAmount2 */,
                101 /* dstAmount2 */
            );

            orderComparison.should.be.bignumber.below(zeroBN);
        });

        it("compare orders: order1 worse than order2 -> positive", async () => {
            const orderComparison = await orders.compareOrders.call(
                10 /* srcAmount1 */,
                101 /* dstAmount1 */,
                10 /* srcAmount2 */,
                100 /* dstAmount2 */
            );

            orderComparison.should.be.bignumber.above(zeroBN);
        });

        it("compare orders: order1 equals order2 -> 0", async () => {
            const orderComparison = await orders.compareOrders.call(
                3579 /* srcAmount1 */,
                2468 /* dstAmount1 */,
                3579 /* srcAmount2 */,
                2468 /* dstAmount2 */
            );

            orderComparison.should.be.bignumber.equal(zeroBN);
        });

        it("small differences in the order amounts should influence", async () => {
            const orderComparison = await orders.compareOrders.call(
                new BN(2).mul(precision).add(new BN(300)) /* srcAmount1 */,
                new BN(9).mul(precision).add(new BN(220)) /* dstAmount1 */,
                new BN(2).mul(precision).add(new BN(300)) /* srcAmount2 */,
                new BN(9).mul(precision).add(new BN(200)) /* dstAmount2 */
            );

            orderComparison.should.be.bignumber.above(zeroBN);
        });

        it("handles possible overflows due to multiplication", async () => {
            const orderComparison = await orders.compareOrders.call(
                new BN(300) /* srcAmount1 */,
                new BN(2).pow(new BN(128)).sub(new BN(1)) /* dstAmount1 */,
                new BN(2).pow(new BN(128)).sub(new BN(1)) /* srcAmount2 */,
                new BN(200) /* dstAmount2 */
            );

            orderComparison.should.be.bignumber.above(zeroBN);
        });
    });

    describe("#findPrevOrderId", async () => {
        it("should handle empty list", async () => {
            let srcAmount = new BN(10);
            let dstAmount = 100;
            let prevId = await orders.findPrevOrderId(srcAmount, dstAmount);

            prevId.should.be.bignumber.equal(HEAD_ID);
        });

        it("should handle list with better orders", async () => {
            let betterId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );

            let srcAmount = new BN(10);
            let dstAmount = 200;
            let prevId = await orders.findPrevOrderId(srcAmount, dstAmount);

            prevId.should.be.bignumber.equal(betterId);
        });

        it("find handle list with worse orders", async () => {
            let worseId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */
            );

            let srcAmount = new BN(10);
            let dstAmount = 200;
            let prevId = await orders.findPrevOrderId(srcAmount, dstAmount);

            prevId.should.be.bignumber.equal(HEAD_ID);
        });

        it("find handle list with worse and better orders", async () => {
            let betterId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );
            let worseId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */
            );

            let srcAmount = new BN(10);
            let dstAmount = 200;
            let prevId = await orders.findPrevOrderId(srcAmount, dstAmount);

            prevId.should.be.bignumber.equal(betterId);
        });
    });

    describe("#add", async () => {
        it("should add order and get its data back with user as maker", async () => {
            let order = await addOrder(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );

            order.maker.should.equal(user1);
            order.srcAmount.should.be.bignumber.equal(new BN(10));
            order.dstAmount.should.be.bignumber.equal(new BN(100));
        });

        it("should add single order so that head is its prev and tail is its next", async () => {
            let order = await addOrder(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );

            order.prevId.should.be.bignumber.equal(HEAD_ID);
            order.nextId.should.be.bignumber.equal(TAIL_ID);
        });

        it("should add two orders and get the data back with users as makers", async () => {
            let order1 = await addOrder(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );
            let order2 = await addOrder(
                user2 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );

            order1.maker.should.equal(user1);
            order1.srcAmount.should.be.bignumber.equal(new BN(10));
            order1.dstAmount.should.be.bignumber.equal(new BN(100));
            order2.maker.should.equal(user2);
            order2.srcAmount.should.be.bignumber.equal(new BN(10));
            order2.dstAmount.should.be.bignumber.equal(new BN(200));
        });

        it("should return order maker from a different user", async () => {
            let orderId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */,
                {from: user1}
            );

            let params = await orders.getOrderDetails(orderId, {from: user2});
            let maker = params.maker;

            maker.should.equal(user1);
        });

        it("should add two orders so that -> HEAD <-> first <-> second <-> TAIL", async () => {
            let id1 = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let id2 = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);

            // HEAD -> 1 -> 2 -> TAIL
            await assertOrdersOrder2(id1, id2);
        });

        it("should add orders according to sorting algorithm", async () => {
            let worseId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );
            let betterId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );

            // HEAD -> better -> worse -> TAIL
            await assertOrdersOrder2(betterId, worseId);
        });

        it("add order to an empty list", async () => {
            let order = await addOrder(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );

            // HEAD -> order -> TAIL
            await assertOrdersOrder1(order.id);
        });

        it("add order to list after better order", async () => {
            let betterId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );

            let order = await addOrder(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );

            // HEAD -> better -> order -> TAIL
            await assertOrdersOrder2(betterId, order.id);
        });

        it("add order to list before worse order", async () => {
            let worseId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );

            let order = await addOrder(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );

            // HEAD -> order -> worse -> TAIL
            await assertOrdersOrder2(order.id, worseId);
        });

        it("add order to list between better and worse ones", async () => {
            let worseId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */
            );
            let betterId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );

            let order = await addOrder(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );

            // HEAD -> better -> order -> worse -> TAIL
            await assertOrdersOrder3(betterId, order.id, worseId);
        });

        it("should reject adding an order with invalid id: 0", async () => {
            try {
                await orders.add(
                    user1 /* maker */,
                    0 /* orderId */,
                    10 /* srcAmount */,
                    100 /* dstAmount */
                );
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(
                    Helper.isRevertErrorMessage(e),
                    "expected revert but got: " + e);
            }
        });

        it("should reject adding an order with invalid id: HEAD", async () => {
            try {
                await orders.add(
                    user1 /* maker */,
                    HEAD_ID /* orderId */,
                    10 /* srcAmount */,
                    100 /* dstAmount */
                );
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(
                    Helper.isRevertErrorMessage(e),
                    "expected revert but got: " + e);
            }
        });

        it("should reject adding an order with invalid id: TAIL", async () => {
            try {
                await orders.add(
                    user1 /* maker */,
                    TAIL_ID /* orderId */,
                    10 /* srcAmount */,
                    100 /* dstAmount */
                );
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(
                    Helper.isRevertErrorMessage(e),
                    "expected revert but got: " + e);
            }
        });
    });

    describe("#addAfterId", async () => {
        it("add order after a specified order id", async () => {
            let worseId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */
            );
            let betterId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );

            let order = await addOrderAfterId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */,
                betterId
            );

            // HEAD -> better -> order -> worse -> TAIL
            await assertOrdersOrder3(betterId, order.id, worseId);
        });

        it("should reject adding after invalid order id: non-existant", async () => {
            let id = await allocateIds(1);

            // Calling locally so that the order will not be in fact added to the
            // list and thus the id will be invalid.
            let nonExistantOrderId = await orders.allocateIds.call(1);

            let added = await orders.addAfterId.call(
                user1 /* maker */,
                id /* orderId */,
                10 /* srcAmount */,
                200 /* dstAmount */,
                nonExistantOrderId
            );

            added.should.be.false;
        });

        it("should reject adding after invalid order id: is TAIL", async () => {
            let orderId = await allocateIds(1);
            let added = await orders.addAfterId.call(
                user1 /* maker */,
                orderId /* orderId */,
                10 /* srcAmount */,
                200 /* dstAmount */,
                // TAIL is technically a non-existant order, as the ID used for
                // it should not have an order in it, but the verification was
                // added to make this requirement explicit.
                TAIL_ID
            );

            added.should.be.false;
        });

        it("should reject adding after invalid order id: after worse order", async () => {
            let worseId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */
            );

            let orderId = await allocateIds(1);
            let added = await orders.addAfterId.call(
                user1 /* maker */,
                orderId /* orderId */,
                10 /* srcAmount */,
                200 /* dstAmount */,
                worseId);

            added.should.be.false;
        });

        it("should reject adding after invalid order id: before better order", async () => {
            let bestId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */
            );
            let betterId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );

            let orderId = await allocateIds(1);
            let added = await orders.addAfterId.call(
                user1 /* maker */,
                orderId /* orderId */,
                10 /* srcAmount */,
                100 /* dstAmount */,
                bestId);

            added.should.be.false;
        });

        it("should allow adding order specifically after head", async () => {
            let orderId = await allocateIds(1);

            const added = await orders.addAfterId.call(
                user1 /* maker */,
                orderId /* orderId */,
                10 /* srcAmount */,
                100 /* dstAmount */,
                HEAD_ID /* prevId */
            );
            await orders.addAfterId(
                user1 /* maker */,
                orderId /* orderId */,
                10 /* srcAmount */,
                100 /* dstAmount */,
                HEAD_ID /* prevId */
            );

            added.should.be.true;
            await assertOrdersOrder1(orderId);
        });

        // it("check gas price of isRightPosition()", async () => {
        //     let orderId1 = await allocateIds(1);
        //     await orders.addAfterId(
        //         user1 /* maker */,
        //         orderId1 /* orderId */,
        //         10 /* srcAmount */,
        //         100 /* dstAmount */,
        //         HEAD_ID /* prevId */
        //     );
        //
        //     let orderId2 = await allocateIds(1);
        //     const res = await orders.addAfterId(
        //         user1 /* maker */,
        //         orderId2 /* orderId */,
        //         10 /* srcAmount */,
        //         200 /* dstAmount */,
        //         orderId1 /* prevId */
        //     );
        //
        //     await debugOrders(5)
        //     console.log(res)
        // });
    });

    describe("#remove", async () => {
        it("remove order removes from list but does not delete order", async () => {
            let orderId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);

            await orders.remove(orderId);

            let order = await getOrderById(orderId);
            order.maker.should.be.bignumber.equal(user1);
            order.srcAmount.should.be.bignumber.equal(new BN(10));
            order.dstAmount.should.be.bignumber.equal(new BN(100));
        });

        it("removing all orders from list: starting with highest", async () => {
            let worseId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let betterId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);

            await orders.remove(worseId);
            await orders.remove(betterId);

            // List is empty
            let head = await getOrderById(HEAD_ID);
            head.nextId.should.be.bignumber.equal(TAIL_ID);
        });

        it("remove all orders from list: starting with lowest", async () => {
            let worseId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let betterId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);

            await orders.remove(betterId);
            await orders.remove(worseId);

            // List is empty
            let head = await getOrderById(HEAD_ID);
            head.nextId.should.be.bignumber.equal(TAIL_ID);
        });

        it("remove order from list maintains order: last order", async () => {
            let worseId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let betterId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);

            await orders.remove(worseId);

            // HEAD -> better -> TAIL
            await assertOrdersOrder1(betterId);
        });

        it("remove order from list maintains order: first order", async () => {
            let worseId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let betterId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);

            await orders.remove(betterId);

            // HEAD -> worse -> TAIL
            await assertOrdersOrder1(worseId);
        });

        it("remove order from list maintains order: middle order", async () => {
            let worseId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);
            let middleId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let betterId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);

            await orders.remove(middleId);

            // HEAD -> better -> worse -> TAIL
            await assertOrdersOrder2(betterId, worseId);
        });

        it("should reject removing HEAD", async () => {
            try {
                await orders.remove(HEAD_ID);
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(
                    Helper.isRevertErrorMessage(e),
                    "expected revert but got: " + e);
            }
        });

        it("should reject removing TAIL", async () => {
            try {
                await orders.remove(TAIL_ID);
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(
                    Helper.isRevertErrorMessage(e),
                    "expected revert but got: " + e);
            }
        });

        it("should reject removing order with id 0", async () => {
            try {
                await orders.remove(0);
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(
                    Helper.isRevertErrorMessage(e),
                    "expected revert but got: " + e);
            }
        });

        it("should reject removing non-existant id", async () => {
            // Calling locally so that the order will not be in fact added to the
            // list and thus the id will be invalid.
            let nonExistantOrderId = await orders.allocateIds.call(1);

            try {
                await orders.remove(nonExistantOrderId);
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(
                    Helper.isRevertErrorMessage(e),
                    "expected revert but got: " + e);
            }
        });

        it("using removed orders as hint fails with no effect to order list: first order", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */
            );

            await orders.remove(firstId);

            const newId = await orders.allocateIds.call(1);
            await orders.allocateIds(1);

            const added = await orders.addAfterId.call(
                user1 /* maker */,
                newId /* orderId */,
                10 /* srcAmount */,
                150 /* dstAmount */,
                firstId /* prevId */
            );
            await orders.addAfterId(
                user1 /* maker */,
                newId /* orderId */,
                10 /* srcAmount */,
                150 /* dstAmount */,
                firstId /* prevId */
            );

            added.should.be.false;

            // after: HEAD -> second -> third -> TAIL
            await assertOrdersOrder2(secondId, thirdId);
        });

        it("using removed orders as hint fails with no effect to order list: middle order", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */
            );

            await orders.remove(secondId);

            const newId = await orders.allocateIds.call(1);
            await orders.allocateIds(1);

            const added = await orders.addAfterId.call(
                user1 /* maker */,
                newId /* orderId */,
                10 /* srcAmount */,
                250 /* dstAmount */,
                secondId /* prevId */
            );
            await orders.addAfterId(
                user1 /* maker */,
                newId /* orderId */,
                10 /* srcAmount */,
                250 /* dstAmount */,
                secondId /* prevId */
            );

            added.should.be.false;

            // after: HEAD -> first -> third -> TAIL
            await assertOrdersOrder2(firstId, thirdId);
        });

        it("using removed orders as hint fails with no effect to order list: last order", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */
            );

            await orders.remove(thirdId);

            const newId = await orders.allocateIds.call(1);
            await orders.allocateIds(1);

            const added = await orders.addAfterId.call(
                user1 /* maker */,
                newId /* orderId */,
                10 /* srcAmount */,
                350 /* dstAmount */,
                thirdId /* prevId */
            );
            await orders.addAfterId(
                user1 /* maker */,
                newId /* orderId */,
                10 /* srcAmount */,
                350 /* dstAmount */,
                thirdId /* prevId */
            );

            added.should.be.false;

            // after: HEAD -> first -> third -> TAIL
            await assertOrdersOrder2(firstId, secondId);
        });

        it("using removed order as hint should fail when list is empty", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );

            await orders.remove(firstId);

            const newId = await orders.allocateIds.call(1);
            await orders.allocateIds(1);

            const added = await orders.addAfterId.call(
                user1 /* maker */,
                newId /* orderId */,
                10 /* srcAmount */,
                250 /* dstAmount */,
                firstId /* prevId */
            );
            await orders.addAfterId(
                user1 /* maker */,
                newId /* orderId */,
                10 /* srcAmount */,
                250 /* dstAmount */,
                firstId /* prevId */
            );

            added.should.be.false;

            // after: HEAD -> TAIL
            const head = await getOrderById(HEAD_ID);
            head.nextId.should.be.bignumber.equal(TAIL_ID);
        });
    });

    describe("#update", async () => {
        it("should update order contents with new amounts ", async () => {
            let orderId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);

            let srcAmount = new BN(20);
            let dstAmount = new BN(200);
            await orders.update(orderId, srcAmount, dstAmount);

            let order = await getOrderById(orderId);
            order.maker.should.equal(user1);
            order.srcAmount.should.be.bignumber.equal(srcAmount);
            order.dstAmount.should.be.bignumber.equal(dstAmount);
        });

        it("should keep correct order position following update: first -> first", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            let srcAmount = new BN(10);
            let dstAmount = 90;
            await orders.update(firstId, srcAmount, dstAmount);

            // after: HEAD -> first -> second -> third -> TAIL
            await assertOrdersOrder3(firstId, secondId, thirdId);
        });

        it("should keep correct order position following update: first -> second", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            let srcAmount = new BN(10);
            let dstAmount = 220;
            await orders.update(firstId, srcAmount, dstAmount);

            // after: HEAD -> second -> first -> third -> TAIL
            await assertOrdersOrder3(secondId, firstId, thirdId);
        });

        it("should keep correct order position following update: first -> third", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            let srcAmount = new BN(10);
            let dstAmount = 330;
            await orders.update(firstId, srcAmount, dstAmount);

            // after: HEAD -> second -> third -> first -> TAIL
            await assertOrdersOrder3(secondId, thirdId, firstId);
        });

        it("should keep correct order position following update: second -> first", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            let srcAmount = new BN(10);
            let dstAmount = 90;
            await orders.update(secondId, srcAmount, dstAmount);

            // after: HEAD -> second -> first -> third -> TAIL
            await assertOrdersOrder3(secondId, firstId, thirdId);
        });

        it("should keep correct order position following update: second -> second", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            let srcAmount = new BN(10);
            let dstAmount = 220;
            await orders.update(secondId, srcAmount, dstAmount);

            // after: HEAD -> first -> second -> third -> TAIL
            await assertOrdersOrder3(firstId, secondId, thirdId);
        });

        it("should keep correct order position following update: second -> third", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            let srcAmount = new BN(10);
            let dstAmount = 330;
            await orders.update(secondId, srcAmount, dstAmount);

            // after: HEAD -> first -> third -> second -> TAIL
            await assertOrdersOrder3(firstId, thirdId, secondId);
        });

        it("should keep correct order position following update: third -> first", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            let srcAmount = new BN(10);
            let dstAmount = 90;
            await orders.update(thirdId, srcAmount, dstAmount);

            // after: HEAD -> third -> first -> second -> TAIL
            await assertOrdersOrder3(thirdId, firstId, secondId);
        });

        it("should keep correct order position following update: third -> second", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            let srcAmount = new BN(10);
            let dstAmount = 180;
            await orders.update(thirdId, srcAmount, dstAmount);

            // after: HEAD -> first -> third -> second -> TAIL
            await assertOrdersOrder3(firstId, thirdId, secondId);
        });

        it("should keep correct order position following update: third -> third", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            let srcAmount = new BN(10);
            let dstAmount = 330;
            await orders.update(thirdId, srcAmount, dstAmount);

            // after: HEAD -> first -> second -> third -> TAIL
            await assertOrdersOrder3(firstId, secondId, thirdId);
        });
    });

    describe("#updateWithPositionHint", async () => {
        let UPDATE_ONLY_AMOUNTS;
        let UPDATE_MOVE_ORDER;
        let UPDATE_FAILED;

        beforeEach("setting up the update method constants", async () => {
            UPDATE_ONLY_AMOUNTS = await orders.UPDATE_ONLY_AMOUNTS();
            UPDATE_MOVE_ORDER = await orders.UPDATE_MOVE_ORDER();
            UPDATE_FAILED = await orders.UPDATE_FAILED();
        });

        it("should update with prev hint: contents -> new amounts", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            let srcAmount = new BN(10);
            let dstAmount = new BN(190);

            let [updated, updateMethod]  = await updateWithPositionHint(
                thirdId /* orderId */,
                srcAmount /* srcAmount */,
                dstAmount /* dstAmount */,
                firstId /* prevId */
            );

            updated.should.be.true;
            updateMethod.should.be.bignumber.equal(UPDATE_MOVE_ORDER);
            const order = await getOrderById(thirdId);
            order.maker.should.equal(user1);
            order.srcAmount.should.be.bignumber.equal(srcAmount);
            order.dstAmount.should.be.bignumber.equal(dstAmount);
        });

        it("should update with prev hint: new position", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            let srcAmount = new BN(10);
            let dstAmount = new BN(190);
            const [updated, updateMethod] = await updateWithPositionHint(
                thirdId /* orderId */,
                srcAmount /* srcAmount */,
                dstAmount /* dstAmount */,
                firstId /* prevId */
            );

            updated.should.be.true;
            updateMethod.should.be.bignumber.equal(UPDATE_MOVE_ORDER);
            // after: HEAD -> first -> third -> second -> TAIL
            await assertOrdersOrder3(firstId, thirdId, secondId);
        });

        it("should reject update with bad hint: non-existant", async () => {
            let order = await addOrder(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */,
            );

            // Calling locally so that the order will not be in fact added to the
            // list and thus the id will be invalid.
            let nonExistantOrderId = await orders.allocateIds.call(1);

            const [updated, updateMethod] = await updateWithPositionHint(
                order.id /* orderId */,
                20 /* srcAmount */,
                200 /* dstAmount */,
                nonExistantOrderId /* prevId */
            );

            // Nothing should have changed.
            updated.should.be.false;
            updateMethod.should.be.bignumber.equal(UPDATE_FAILED);

            order = await getOrderById(order.id);
            order.srcAmount.should.be.bignumber.equal(new BN(10));
            order.dstAmount.should.be.bignumber.equal(new BN(200));

            // after: HEAD -> order -> TAIL
            await assertOrdersOrder1(order.id);
        });

        it("should reject update with bad hint: is TAIL", async () => {
            let order = await addOrder(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */,
            );

            const [updated, updateMethod] = await updateWithPositionHint(
                order.id /* orderId */,
                20 /* srcAmount */,
                200 /* dstAmount */,
                // TAIL is technically a non-existant order, as the ID used for
                // it should not have an order in it, but the verification was
                // added to make this requirement explicit.
                TAIL_ID /* prevId */
            );

            // Nothing should have changed.
            updated.should.be.false;
            updateMethod.should.be.bignumber.equal(UPDATE_FAILED);

            order = await getOrderById(order.id);
            order.srcAmount.should.be.bignumber.equal(new BN(10));
            order.dstAmount.should.be.bignumber.equal(new BN(200));

            // after: HEAD -> order -> TAIL
            await assertOrdersOrder1(order.id);
        });

        it("should reject update with bad hint: after worse order", async () => {
            let order = await addOrder(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */,
            );

            let worseId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );

            const [updated, updateMethod] = await updateWithPositionHint(
                order.id /* orderId */,
                10 /* srcAmount */,
                150 /* dstAmount */,
                worseId /* prevId */
            );

            // Nothing should have changed.
            updated.should.be.false;
            updateMethod.should.be.bignumber.equal(UPDATE_FAILED);

            order = await getOrderById(order.id);
            order.srcAmount.should.be.bignumber.equal(new BN(10));
            order.dstAmount.should.be.bignumber.equal(new BN(100));

            // after: HEAD -> order -> worse -> TAIL
            await assertOrdersOrder2(order.id, worseId);
        });

        it("should reject update with bad hint: before better order", async () => {
            let order = await addOrder(
                user1 /* maker */,
                10 /* srcAmount */,
                400 /* dstAmount */,
            );

            let bestId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );
            let betterId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );

            const [updated, updateMethod] = await updateWithPositionHint(
                order.id /* orderId */,
                10 /* srcAmount */,
                250 /* dstAmount */,
                bestId /* prevId */
            );

            // Nothing should have changed.
            updated.should.be.false;
            updateMethod.should.be.bignumber.equal(UPDATE_FAILED);

            order = await getOrderById(order.id);
            order.srcAmount.should.be.bignumber.equal(new BN(10));
            order.dstAmount.should.be.bignumber.equal(new BN(400));

            // after: HEAD -> best -> better -> order -> TAIL
            await assertOrdersOrder3(bestId, betterId, order.id);
        });

        it("should update amounts when current prevId == provided prevId", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            const [updated, updateMethod] = await updateWithPositionHint(
                secondId /* orderId */,
                10 /* srcAmount */,
                150 /* dstAmount */,
                firstId /* prevId */
            );

            updated.should.be.true;
            updateMethod.should.be.bignumber.equal(UPDATE_ONLY_AMOUNTS);

            // values changed.
            const order = await getOrderById(secondId);
            order.maker.should.equal(user1);
            order.srcAmount.should.be.bignumber.equal(new BN(10));
            order.dstAmount.should.be.bignumber.equal(new BN(150));

            // order did not change
            // after: HEAD -> first -> second -> third -> TAIL
            await assertOrdersOrder3(firstId, secondId, thirdId);
        });

        it("update when order is first and stays in position", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            const [updated, updateMethod] = await updateWithPositionHint(
                firstId /* orderId */,
                10 /* srcAmount */,
                90 /* dstAmount */,
                HEAD_ID /* prevId */
            );

            updated.should.be.true;
            updateMethod.should.be.bignumber.equal(UPDATE_ONLY_AMOUNTS);
            let order = await getOrderById(firstId);
            order.srcAmount.should.be.bignumber.equal(new BN(10));
            order.dstAmount.should.be.bignumber.equal(new BN(90));

            // after: HEAD -> first -> second -> third -> TAIL
            await assertOrdersOrder3(firstId, secondId, thirdId);
        });

        it("update when order in middle and stays in position", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            const [updated, updateMethod] = await updateWithPositionHint(
                secondId /* orderId */,
                10 /* srcAmount */,
                220 /* dstAmount */,
                firstId /* prevId */
            );

            updated.should.be.true;
            updateMethod.should.be.bignumber.equal(UPDATE_ONLY_AMOUNTS);
            let order = await getOrderById(secondId);
            order.srcAmount.should.be.bignumber.equal(new BN(10));
            order.dstAmount.should.be.bignumber.equal(new BN(220));

            // after: HEAD -> first -> second -> third -> TAIL
            await assertOrdersOrder3(firstId, secondId, thirdId);
        });

        it("update when order in last and stays in position", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */);
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */);
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            const [updated, updateMethod] = await updateWithPositionHint(
                thirdId /* orderId */,
                10 /* srcAmount */,
                280 /* dstAmount */,
                secondId /* prevId */
            );

            updated.should.be.true;
            updateMethod.should.be.bignumber.equal(UPDATE_ONLY_AMOUNTS);
            let order = await getOrderById(thirdId);
            order.srcAmount.should.be.bignumber.equal(new BN(10));
            order.dstAmount.should.be.bignumber.equal(new BN(280));

            // after: HEAD -> first -> second -> third -> TAIL
            await assertOrdersOrder3(firstId, secondId, thirdId);
        });

        it("should reject updates to HEAD", async () => {
            try {
                await updateWithPositionHint(
                    HEAD_ID /* orderId */,
                    10 /* srcAmount */,
                    310 /* dstAmount */,
                    HEAD_ID /* prevId */
                );
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(
                    Helper.isRevertErrorMessage(e),
                    "expected revert but got: " + e);
            }
        });

        it("should reject updates to TAIL", async () => {
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            try {
                await updateWithPositionHint(
                    TAIL_ID /* orderId */,
                    10 /* srcAmount */,
                    310 /* dstAmount */,
                    firstId /* prevId */
                );
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(
                    Helper.isRevertErrorMessage(e),
                    "expected revert but got: " + e);
            }
        });

        it("should reject updates to node with id 0", async () => {
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            try {
                await updateWithPositionHint(
                    0 /* orderId */,
                    10 /* srcAmount */,
                    310 /* dstAmount */,
                    firstId /* prevId */
                );
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(
                    Helper.isRevertErrorMessage(e),
                    "expected revert but got: " + e);
            }
        });

        it("reject if prevId is orderId", async () => {
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */);

            try {
                await updateWithPositionHint(
                    firstId /* orderId */,
                    10 /* srcAmount */,
                    190 /* dstAmount */,
                    firstId /* prevId */
                );
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(
                    Helper.isRevertErrorMessage(e),
                    "expected revert but got: " + e);
            }
        });

        it("should reject updates using removed order ids: first order", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */
            );

            await orders.remove(firstId);

            const [updated, updateMethod] = await updateWithPositionHint(
                thirdId /* orderId */,
                10 /* srcAmount */,
                150 /* dstAmount */,
                firstId /* prevId */
            );

            updated.should.be.false;
            updateMethod.should.be.bignumber.equal(UPDATE_FAILED);

            // values changed.
            const order = await getOrderById(thirdId);
            order.maker.should.equal(user1);
            order.srcAmount.should.be.bignumber.equal(new BN(10));
            order.dstAmount.should.be.bignumber.equal(new BN(300));

            // after: HEAD -> second -> third -> TAIL
            await assertOrdersOrder2(secondId, thirdId);
        });
        it("should reject updates using removed order ids: middle order", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */
            );

            await orders.remove(secondId);

            const [updated, updateMethod] = await updateWithPositionHint(
                thirdId /* orderId */,
                10 /* srcAmount */,
                350 /* dstAmount */,
                secondId /* prevId */
            );

            updated.should.be.false;
            updateMethod.should.be.bignumber.equal(UPDATE_FAILED);

            // values changed.
            const order = await getOrderById(thirdId);
            order.maker.should.equal(user1);
            order.srcAmount.should.be.bignumber.equal(new BN(10));
            order.dstAmount.should.be.bignumber.equal(new BN(300));

            // after: HEAD -> first -> third -> TAIL
            await assertOrdersOrder2(firstId, thirdId);
        });
        it("should reject updates using removed order ids: last order", async () => {
            // before: HEAD -> first -> second -> third -> TAIL
            let firstId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */
            );
            let secondId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );
            let thirdId = await addOrderGetId(
                user1 /* maker */,
                10 /* srcAmount */,
                300 /* dstAmount */
            );

            await orders.remove(thirdId);

            const [updated, updateMethod] = await updateWithPositionHint(
                firstId /* orderId */,
                10 /* srcAmount */,
                350 /* dstAmount */,
                thirdId /* prevId */
            );

            updated.should.be.false;
            updateMethod.should.be.bignumber.equal(UPDATE_FAILED);

            // values changed.
            const order = await getOrderById(firstId);
            order.maker.should.equal(user1);
            order.srcAmount.should.be.bignumber.equal(new BN(10));
            order.dstAmount.should.be.bignumber.equal(new BN(100));

            // after: HEAD -> first -> second -> TAIL
            await assertOrdersOrder2(firstId, secondId);
        });
    });

    describe("#getFirstOrder", async () => {
        it("should return first order id with getFirstOrder ", async () => {
            let order = await addOrder(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */
            );

            let params = await orders.getFirstOrder();
            let firstOrderId = params[0];
            let isEmpty = params[1];

            firstOrderId.should.be.bignumber.equal(order.id);
            isEmpty.should.equal(false);
        });

        it("should return empty if called with getFirstOrder when no order", async () => {
            let params = await orders.getFirstOrder();
            let firstOrderId = params[0];
            let isEmpty = params[1];

            isEmpty.should.equal(true);
        });
    });
});

class Order {
    constructor(id, maker, srcAmount, dstAmount, prevId, nextId) {
        this.id = id;
        this.maker = maker;
        this.srcAmount = srcAmount;
        this.dstAmount = dstAmount;
        this.prevId = prevId;
        this.nextId = nextId;
    }
}

async function getOrderById(id) {
    let params = await orders.getOrderDetails(id);
    let maker = params.maker;
    let srcAmount = params.srcAmount;
    let dstAmount = params.dstAmount;
    let prevId = params.prevId;
    let nextId = params.nextId;

    return new Order(id, maker, srcAmount, dstAmount, prevId, nextId);
}

async function addOrderGetId(maker, srcAmount, dstAmount, args = 'none') {
    let orderId = await allocateIds(1);
    if (args == 'none') {
        await orders.add(maker, orderId, srcAmount, dstAmount);
    } else {
        await orders.add(maker, orderId, srcAmount, dstAmount, args);
    }
    return orderId;
}

async function addOrderAfterIdGetId(
        maker,
        srcAmount,
        dstAmount,
        prevId,
        args = 'none'
    )
{
    let orderId = await allocateIds(1);

    let canAdd;

    if (args == 'none') {
        canAdd = await orders.addAfterId.call(
                user1 /* maker */,
                orderId,
                srcAmount,
                dstAmount,
                prevId
            )
    } else {
        await orders.addAfterId.call(
                user1 /* maker */,
                orderId,
                srcAmount,
                dstAmount,
                prevId,
                args
            );
    }

    if (!canAdd) throw new Error('add after id failed');

    if (args == 'none') {
        await orders.addAfterId(
            user1 /* maker */,
            orderId,
            srcAmount,
            dstAmount,
            prevId
       );
    } else {
        await orders.addAfterId(
            user1 /* maker */,
            orderId,
            srcAmount,
            dstAmount,
            prevId,
            args
        );
    }

    return orderId;
}

async function addOrder(maker, srcAmount, dstAmount, args = 'none') {
    let orderId = await addOrderGetId(maker, srcAmount, dstAmount, args);
    return await getOrderById(orderId);
}

async function addOrderAfterId(maker, srcAmount, dstAmount, prevId, args = 'none') {
    let id = await addOrderAfterIdGetId(
        maker, srcAmount, dstAmount, prevId, args);
    return await getOrderById(id);
}

async function allocateIds(howMany) {
    let firstId = await orders.allocateIds.call(howMany);
    await orders.allocateIds(howMany);
    return firstId;
}

async function updateWithPositionHint(orderId, srcAmount, dstAmount, prevId) {
    let rxUpdate = await orders.updateWithPositionHint.call(
        orderId,
        srcAmount,
        dstAmount,
        prevId
    );

    const updated = rxUpdate[0];
    const updateMethod = rxUpdate[1];
    await orders.updateWithPositionHint(
        orderId,
        srcAmount,
        dstAmount,
        prevId
    );
    return [updated, updateMethod];
}

async function assertOrdersOrder1(orderId1) {
    const head = await getOrderById(HEAD_ID);
    const order1 = await getOrderById(orderId1);

    // after: HEAD -> order1 -> TAIL
    head.nextId.should.be.bignumber.equal(order1.id);
    order1.nextId.should.be.bignumber.equal(TAIL_ID);
    // after: HEAD <- order1
    order1.prevId.should.be.bignumber.equal(head.id);
}

async function assertOrdersOrder2(orderId1, orderId2) {
    const head = await getOrderById(HEAD_ID);
    const order1 = await getOrderById(orderId1);
    const order2 = await getOrderById(orderId2);

    // after: HEAD -> order1 -> order2 -> TAIL
    head.nextId.should.be.bignumber.equal(order1.id);
    order1.nextId.should.be.bignumber.equal(order2.id);
    order2.nextId.should.be.bignumber.equal(TAIL_ID);
    // after: HEAD <- order1 <- order2
    order2.prevId.should.be.bignumber.equal(order1.id);
    order1.prevId.should.be.bignumber.equal(head.id);
}

async function assertOrdersOrder3(orderId1, orderId2, orderId3) {
    const head = await getOrderById(HEAD_ID);
    const order1 = await getOrderById(orderId1);
    const order2 = await getOrderById(orderId2);
    const order3 = await getOrderById(orderId3);

//    orderID1.nextId
    // after: HEAD -> order1 -> order2 -> order3 -> TAIL
    head.nextId.should.be.bignumber.equal(order1.id);
    order1.nextId.should.be.bignumber.equal(order2.id);
    order2.nextId.should.be.bignumber.equal(order3.id);
    order3.nextId.should.be.bignumber.equal(TAIL_ID);
    // after: HEAD <- order1 <- order2 <- order3
    order3.prevId.should.be.bignumber.equal(order2.id);
    order2.prevId.should.be.bignumber.equal(order1.id);
    order1.prevId.should.be.bignumber.equal(head.id);
}

// To debug and order list with X orders pass at least X+3 as max (for id 0,
// head and tail).
async function debugOrders(max) {
    let maker, prevId, nextId, srcAmount, dstAmount;
    for (i = 0; i < max; i++) {
    [maker, prevId, nextId, srcAmount, dstAmount] = await orders.orders(i);
        console.log(
            `orders[${i}]=(maker=${maker}, prevId=${prevId}, nextId=${nextId}, `
                + `srcAmount=${srcAmount}, dstAmount=${dstAmount})`
            );
    }
}

function log(str) {
    console.log(str)
}
