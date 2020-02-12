import { Entity, EntityQuery, EntityType, MetadataStore, EntityManager, EntityState, ComplexType, core, RelationArray, MergeStrategy, breeze, EntityAspect, PropertyChangedEventArgs, ArrayChangedArgs, DataProperty, NavigationProperty, StructuralType, DataType } from 'breeze-client';
import { TestFns, JsonObj } from './test-fns';

TestFns.initNonServerEnv();

beforeAll(async () => {
  TestFns.initSampleMetadataStore();

});

describe("Entity Creation - no server", () => {

  beforeEach(function () {

  });

  test("createEntity", () => {
    let em = new EntityManager('test');
    let ms = em.metadataStore;
    ms.importMetadata(TestFns.sampleMetadata);

    let order = em.createEntity("Order", { shipName: "Barnum"});
    expect(order).toBeTruthy();

    let shipName = order.getProperty("shipName");
    expect(shipName).toEqual("Barnum");

    let orderID = order.getProperty("orderID");
    expect(orderID).toBeLessThanOrEqual(-1);
  });

  test("createEntity - 2", () => {
    const em = TestFns.newEntityManager();
    const emp1 = em.createEntity("Employee");
    expect(emp1.entityAspect.entityState).toBe(EntityState.Added);

    const emp2 = em.createEntity("Employee", { firstName: "John", lastName: "Smith" });
    expect(emp2.entityAspect.entityState).toBe(EntityState.Added);

    const emp3 = em.createEntity("Employee", { firstName: "John", lastName: "Smith" }, EntityState.Detached);
    expect(emp3.entityAspect.entityState).toBe(EntityState.Detached);
    expect(emp3.getProperty("lastName")).toBe("Smith");
  });

  test("createEntity and complex type", () => {

    let em = new EntityManager('test');
    let ms = em.metadataStore;
    ms.importMetadata(TestFns.sampleMetadata);

    let supplier = em.createEntity("Supplier", { companyName: "ACME"});
    expect(supplier).toBeTruthy();

    let locType = ms.getEntityType("Location") as ComplexType;
    expect(locType).toBeTruthy();
    let loc1 = locType.createInstance({ address: "111 Oak Street"});

    supplier.setProperty("location", loc1);
    let ok = supplier.entityAspect.validateEntity();
    expect(ok).toBeTruthy();

    let loc2 = supplier.getProperty("location");
    expect(loc2).toBeTruthy();
    expect(loc2.address).toEqual("111 Oak Street");
  });

  test("createEntity - duplicate entity keys", () => {
    const em = TestFns.newEntityManager();

    const cust1 = em.createEntity("Customer", null, EntityState.Detached);
    const cust2 = em.createEntity("Customer", null, EntityState.Detached);
    const customerKeyName = TestFns.wellKnownData.keyNames.customer;
    em.attachEntity(cust1);
    try {
      const cust1Id = cust1.getProperty(customerKeyName);
      cust2.setProperty(customerKeyName, cust1Id);
      em.attachEntity(cust2);
      throw new Error('should not get here');
    } catch (e) {
      expect(e.message).toMatch(/key/);
    }
  });

  test("createEntity - set nullable props with an empty string", function () {
    const em = TestFns.newEntityManager();

    const emp = em.createEntity("Employee", { firstName: "Joe", lastName: "Smith", birthDate: new Date(2000, 1, 1) });
    const bd = emp.getProperty("birthDate");
    expect(bd != null);
    emp.setProperty("birthDate", "");
    const b2 = emp.getProperty("birthDate");
    expect(b2).toBeNull;
  });

  test("createEntity and check default values", function () {
    const et = TestFns.sampleMetadataStore.getAsEntityType("Customer");
    checkDefaultValues(et);
    const entityTypes = TestFns.sampleMetadataStore.getEntityTypes();
    entityTypes.forEach(function (et) {
      checkDefaultValues(et);
    });
  });

  test("createEntity then detach and readd", () => {
    const em = TestFns.newEntityManager();
    const newOrder = em.createEntity("Order");

    em.detachEntity(newOrder);
    em.addEntity(newOrder); 
  });

  test("createEntity merge new into deleted entity", function () {
    const em = TestFns.newEntityManager();
    const custX = em.createEntity("Customer");
    custX.entityAspect.acceptChanges();
    const cust = em.createEntity("Customer");
    // id will be new autogenerated Guid
    const id = cust.getProperty("customerID");
    // make it unmodified so that later delete does NOT detach it.
    cust.entityAspect.acceptChanges();
    cust.entityAspect.setDeleted();
    const sameCust = em.createEntity("Customer", { customerID: id }, null, MergeStrategy.OverwriteChanges);
    expect(sameCust.entityAspect.entityState).toBe(EntityState.Added);
    expect(sameCust.getProperty("customerID")).toBe(id);

    expect(sameCust).toBe(cust);
    em.rejectChanges();
  });

  test("create and init relations", function () {
    const em = TestFns.newEntityManager();
    const orderKeyName = TestFns.wellKnownData.keyNames.order;
    const productKeyName = TestFns.wellKnownData.keyNames.product;
    let newDetail = null;
    // pretend parent entities were queried
    let cfg = {};
    cfg[orderKeyName] = 1;
    const parentOrder = em.createEntity("Order", cfg, breeze.EntityState.Unchanged);
    cfg = {};
    cfg[productKeyName] = 1;
    const parentProduct = em.createEntity("Product", cfg, breeze.EntityState.Unchanged);
    newDetail = em.createEntity("OrderDetail", { order: parentOrder, product: parentProduct });

    expect(newDetail && newDetail.entityAspect.entityState.isAdded()).toBe(true);
    expect(parentOrder.entityAspect.entityState.isUnchanged()).toBe(true);
    expect(parentProduct.entityAspect.entityState.isUnchanged()).toBe(true);
  });


  test("create and init relations - detached entities", function () {
    const em = TestFns.newEntityManager();
    const orderKeyName = TestFns.wellKnownData.keyNames.order;
    const productKeyName = TestFns.wellKnownData.keyNames.product;

    let newDetail = null;
    // pretend parent entities were queried
    let cfg = {};
    cfg[orderKeyName] = 1;
    const parentOrder = em.createEntity("Order", cfg, breeze.EntityState.Detached);
    cfg = {};
    cfg[productKeyName] = 1;
    const parentProduct = em.createEntity("Product", cfg, breeze.EntityState.Detached);
    newDetail = em.createEntity("OrderDetail", { order: parentOrder, product: parentProduct });

    expect(newDetail && newDetail.entityAspect.entityState.isAdded()).toBe(true);
    expect(parentOrder.entityAspect.entityState.isAdded()).toBe(true);
    expect(parentProduct.entityAspect.entityState.isAdded()).toBe(true);
  });

  test("createEntity - can add unmapped 'foo' property directly to EntityType", function () {
    expect(3);
    const store = MetadataStore.importMetadata(TestFns.sampleMetadata);
    assertFooPropertyDefined(store, false);

    const customerType = store.getEntityType('Customer');
    const fooProp = new breeze.DataProperty({
      name: 'foo',
      defaultValue: 42,
      isUnmapped: true  // !!!
    });
    customerType.addProperty(fooProp);

    assertFooPropertyDefined(store, true);

    const cust = store.getAsEntityType('Customer').createEntity();
    const custID = cust.getProperty("customerID");
    const fooValue = cust.getProperty('foo');
    expect(fooValue).toBe(42);
  });


  test("create entity with non-null dates", function () {
    const em = TestFns.newEntityManager(); // new empty EntityManager
    const userType = em.metadataStore.getAsEntityType("User");
    const userKeyName = TestFns.wellKnownData.keyNames.user;
    const user = userType.createEntity();

    const crtnDate = user.getProperty("createdDate");
    const modDate = user.getProperty("modifiedDate");
    expect(core.isDate(crtnDate)).toBe(true);
    expect(core.isDate(modDate)).toBe(true);
    em.addEntity(user);
    // need to do this after the addEntity call
    const id = user.getProperty(userKeyName);
    const exported = em.exportEntities(null, { includeMetadata: false });
    const em2 = TestFns.newEntityManager();
    em2.importEntities(exported);
    const user2 = em2.getEntityByKey("User", id);
    const crtnDate2 = user2.getProperty("createdDate");
    const modDate2 = user2.getProperty("modifiedDate");
    expect(core.isDate(crtnDate2)).toBe(true);
    expect(core.isDate(modDate2)).toBe(true);
    expect(crtnDate2.getTime()).toBe(crtnDate.getTime());
    expect(modDate2.getTime()).toBe(modDate.getTime());
  });


  test("create entity with initial properties", function () {
    const em = TestFns.newEntityManager(); 
    const empType = em.metadataStore.getAsEntityType("Employee");
    const employeeKeyName = TestFns.wellKnownData.keyNames.employee;
    let cfg: JsonObj = {
      firstName: "John",
      lastName: "Smith"
    };

    const testVal = 42;

    cfg[employeeKeyName] = TestFns.wellKnownData.dummyEmployeeID;
    const employee = empType.createEntity(cfg);
    expect(employee.getProperty("firstName")).toBe("John");
    expect(employee.getProperty(employeeKeyName)).toBe(TestFns.wellKnownData.dummyEmployeeID);

    cfg = {
      firstxame: "John",
      lastName: "Smith"
    };
    cfg[employeeKeyName] = TestFns.wellKnownData.dummyEmployeeID;
    const partialEmp = empType.createEntity(cfg);
    expect(employee.getProperty("lastName")).toBe("Smith");
  });

  test("new instead of createEntity with entityAspect", function () {
    const em = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const Customer = TestFns.getCustomerCtor();
    em.metadataStore.registerEntityTypeCtor("Customer", Customer);
    const customerKeyName = TestFns.wellKnownData.keyNames.customer;

    const cust1 = new (Customer as any)();
    cust1.city = "xxx";
    const ea = new EntityAspect(cust1);
    cust1.setProperty("city", "yyy");
    cust1.setProperty(customerKeyName, breeze.core.getUuid());

    const cust2 = em.metadataStore.getAsEntityType("Customer").createEntity();
    cust2.setProperty(customerKeyName, breeze.core.getUuid());

    em.attachEntity(cust1);
    em.attachEntity(cust2);
    expect(em.getEntities().length).toBe(2);
  });


  test("new instead of createEntity w/o entityAspect", function () {
    const em = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const Customer = TestFns.getCustomerCtor();
    em.metadataStore.registerEntityTypeCtor("Customer", Customer);
    const customerKeyName = TestFns.wellKnownData.keyNames.customer;

    const cust0 = new (Customer as any)();
    cust0.setProperty("city", "zzz");
    cust0.setProperty(customerKeyName, breeze.core.getUuid());
    em.attachEntity(cust0);
    expect(cust0.getProperty("city")).toBe("zzz");

    const cust1 = new (Customer as any)();
    cust1.city = "zzz";
    const city = cust1.city;
    expect(city).toBe("zzz");
    cust1[customerKeyName] = breeze.core.getUuid();
    em.attachEntity(cust1);
    expect(cust1.getProperty("city")).toBe("zzz");
  });

  test("post create init 1", () => {
    const em = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const Product = createProductCtor();
    const productType = em.metadataStore.getAsEntityType("Product");
    em.metadataStore.registerEntityTypeCtor("Product", Product, function (entity: Entity) {
      expect(entity.entityType).toBe(productType);
      expect(entity.getProperty("isObsolete")).toBe(false);
      entity.setProperty("isObsolete", true);
    });

    const product = productType.createEntity();
    expect(product.getProperty("isObsolete")).toBe(true);

    product.setProperty("isObsolete", false);
    expect(product.getProperty("isObsolete")).toBe(false);
  });

  test("post create init 2", () => {
    const em = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const Product = createProductCtor();

    const productType = em.metadataStore.getAsEntityType("Product");
    em.metadataStore.registerEntityTypeCtor("Product", Product, "init");

    const product = productType.createEntity();
    expect(product.getProperty("isObsolete")).toBe(true);
  });

  test("post create init 3", () => {
    const em = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const Product = createProductCtor();
    const productType = em.metadataStore.getAsEntityType("Product");
    em.metadataStore.registerEntityTypeCtor("Product", Product, "init");

    const product = productType.createEntity();
    expect(product.getProperty("isObsolete")).toBe(true);
  });

  test("post create init after new and attach", () => {
    const em = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const Product = createProductCtor() as any;
    const product = new Product();
    const productType = em.metadataStore.getAsEntityType("Product");
    em.metadataStore.registerEntityTypeCtor("Product", Product, "init");
    em.attachEntity(product);

    expect(product.getProperty("isObsolete")).toBe(true);
  });


  test("attaching entities in ctor makes fk values update", function () {
    const em = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const initializer = function (sup: any) {
      const prod1 = em.createEntity("Product");
      sup.products.push(prod1);

      const prod2 = em.createEntity("Product");
      sup.products.push(prod2);
      // problem occurs because em._unattachedChildrenMap gets entries for old SupplierID:#Foo-0 and new SupplierID:#Foo--3
    };

    em.metadataStore.registerEntityTypeCtor("Supplier", null, initializer);

    const sup = em.createEntity("Supplier");

    expect(sup.getProperty("supplierID")).toBeLessThan(0);
    const prods = sup.getProperty("products");
    expect(prods[0].getProperty("productID")).toBeLessThan(0);
    expect(prods[0].getProperty("supplierID")).toBeLessThan(0);
    expect(prods[1].getProperty("productID")).toBeLessThan(0);
    expect(prods[1].getProperty("supplierID")).toBeLessThan(0);
  });

  test("attachEntity then detach and reattach", () => {
    const em = TestFns.newEntityManager();
    const orderType = em.metadataStore.getAsEntityType("Order");
    const order = orderType.createEntity();
    em.attachEntity(order);

    em.detachEntity(order);
    em.attachEntity(order); 
  });

  test("attachEntity - store-managed int ID remains '0'", () => {
    const em = TestFns.newEntityManager();
    const employeeKeyName = TestFns.wellKnownData.keyNames.employee;
    const employeeType = em.metadataStore.getAsEntityType("Employee");
    const empIdProp = employeeType.getProperty(employeeKeyName);

    const defaultValue = 0;
    const emp = employeeType.createEntity();
    expect(emp.getProperty(employeeKeyName)).toBe(defaultValue);
    const agkType = employeeType.autoGeneratedKeyType;
    // manager should NOT replace '0' with generated temp id
    em.attachEntity(emp);
    const id = emp.getProperty(employeeKeyName);
    expect(id).toBe(defaultValue);
  });

  test("attachEntity - cannot attach an already attached entity created by a different metadataStore", () => {
    const em = TestFns.newEntityManager();
    const customerType = em.metadataStore.getAsEntityType("Customer");
    const customer = customerType.createEntity();
    
    const newMs = MetadataStore.importMetadata(em.metadataStore.exportMetadata());
    const em2 = TestFns.newEntityManager(newMs);

    expect( () => em2.attachEntity(customer)).toThrow(/MetadataStore/);
  });

  test("attachEntity - cannot attach across entityManagers", () => {
    const em1 = TestFns.newEntityManager();
    const custType = em1.metadataStore.getAsEntityType("Customer");
    const cust = custType.createEntity();

    const em2 = TestFns.newEntityManager();
    em1.attachEntity(cust);

    expect(() => em2.attachEntity(cust)).toThrow(/EntityManager/);
  });

  test("attachEntity - can attach a detached entity to a different manager via attach/detach",  () => {
      const em = TestFns.newEntityManager();
      const customerType = em.metadataStore.getAsEntityType("Customer");
      const customer = customerType.createEntity();
      const orderType = em.metadataStore.getAsEntityType("Order");
      const order = orderType.createEntity();
      em.attachEntity(customer);
      const orders = customer.getProperty("orders");
      expect(orders.length).toBe(0);
      orders.push(order);
      const em2 = TestFns.newEntityManager();
      em.detachEntity(customer);
      em2.attachEntity(customer);
      expect(customer.entityAspect.entityManager).toBe(em2);
    }
  );

  test("attachEntity - can attach a detached entity to a different manager via clear",   () => {
      const em1 = TestFns.newEntityManager();
      const cust = em1.metadataStore.getAsEntityType("Customer").createEntity() as Entity;
      cust.setProperty(TestFns.wellKnownData.keyNames.customer, core.getUuid());

      em1.attachEntity(cust);

      em1.clear(); // should detach cust
      expect(cust.entityAspect.entityState.isDetached()).toBe(true);

      // therefore this should be ok
      const em2 = TestFns.newEntityManager();
      em2.attachEntity(cust); // D#2206 throws exception
    }
  );

  test("addEntity followed by delete", () => {
    const em = TestFns.newEntityManager();
    const typeInfo = em.metadataStore.getAsEntityType("Order");

    const newEntity = em.createEntity(typeInfo);
    expect(newEntity.entityAspect.entityState.isAdded()).toBe(true);

    newEntity.entityAspect.setDeleted();
    expect(newEntity.entityAspect.entityState.isDetached()).toBe(true);

    // get the first (and only) entity in cache
    expect(em.getEntities().length).toBe(0);

  });

  test("addEntity followed by rejectChanges", () => {
    const em = TestFns.newEntityManager();
    const newEntity = em.createEntity("Order");

    let entityState = newEntity.entityAspect.entityState;
    expect(entityState.isAdded()).toBe(true);

    newEntity.entityAspect.rejectChanges();

    entityState = newEntity.entityAspect.entityState;
    expect(entityState.isDetached()).toBe(true);

    expect(em.hasChanges()).toBe(false);

    const inCache = em.getEntities(), count = inCache.length;
    expect(count).toBe(0);
  });

  test("addEntity - no key", function () {
    const em = TestFns.newEntityManager();
    const odType = em.metadataStore.getAsEntityType("OrderDetail");
    const od = odType.createEntity();
    expect(() => em.addEntity(od)).toThrow(/key/);
    expect(() => em.generateTempKeyValue(od)).toThrow(/multipart keys/);

    // only need to set part of the key
    od.setProperty("orderID", 999);
    em.addEntity(od);
    expect(true).toBe(true);
  });


  test("addEntity - no key 2", function () {
    const em = TestFns.newEntityManager();

    expect(() => em.createEntity("OrderDetail")).toThrow(/key/);

    const od = em.createEntity("OrderDetail", null, EntityState.Detached);
    expect(() => em.generateTempKeyValue(od)).toThrow(/multipart keys/);

    // only need to set part of the key
    od.setProperty("orderID", 999);
    em.addEntity(od);
    expect(true).toBe(true);
  });


  test("addEntity - child", () => {
    const em = TestFns.newEntityManager();
    const custType = em.metadataStore.getAsEntityType("Customer");
    const orderType = em.metadataStore.getAsEntityType("Order");
    const cust1 = custType.createEntity();
    const order1 = orderType.createEntity();

    em.addEntity(cust1);
    expect(cust1.entityAspect.entityState).toBe(EntityState.Added);
    expect(cust1.entityAspect.hasTempKey).toBe(true);
    const orders = cust1.getProperty("orders") as RelationArray;

    let changeArgs: ArrayChangedArgs = null;
    orders.arrayChanged.subscribe((args) => {
      changeArgs = args;
    });
    orders.push(order1);
    expect(cust1.entityAspect.entityState).toBe(EntityState.Added);
    expect(order1.entityAspect.entityState).toBe(EntityState.Added);
    expect(orders.parentEntity).toBe(cust1);
    const navProperty = cust1.entityType.getProperty("orders");
    expect(orders.navigationProperty).toBe(navProperty);
    expect(changeArgs.added).toBeTruthy();
    expect(changeArgs.added[0]).toBe(order1);
    const sameCust = order1.getProperty("customer");
    expect(sameCust).toBe(cust1);

  });

  test("addEntity - detach child", () => {
    const em = TestFns.newEntityManager();
    const custType = em.metadataStore.getAsEntityType("Customer");
    const orderType = em.metadataStore.getAsEntityType("Order");
    const cust1 = custType.createEntity();
    const order1 = orderType.createEntity();
    const order2 = orderType.createEntity() as Entity;

    em.addEntity(cust1);
    expect(cust1.entityAspect.entityState).toBe(EntityState.Added);
    const orders = cust1.getProperty("orders") as RelationArray;
    orders.push(order1);
    orders.push(order2);
    let arrayChangeCount = 0;
    orders.arrayChanged.subscribe(function (args) {
      arrayChangeCount += 1;
      expect(args.removed[0]).toBe(order2);
    });
    let order2ChangeCount = 0;
    order2.entityAspect.propertyChanged.subscribe(function (args2) {
      expect(args2.entity).toBe(order2);
      if (args2.propertyName === "customer") {
        order2ChangeCount += 1;
      } else if (args2.propertyName === "customerID") {
        order2ChangeCount += 1;
      } else {
        throw new Error("should not have gotten here");
      }
    });
    const orders2 = cust1.getProperty("orders");
    expect(orders).toBe(orders2);
    const ix = (orders as any).indexOf(order2);
    orders.splice(ix, 1);
    expect(orders.length).toBe(1);
    expect(arrayChangeCount).toBe(1);
    expect(order2ChangeCount).toBe(2);

    const sameCust = order2.getProperty("customer");
    expect(sameCust).toBeNull;
  });

  test("addEntity - add parent", () => {
    const em = TestFns.newEntityManager();
    const custType = em.metadataStore.getAsEntityType("Customer");
    const orderType = em.metadataStore.getAsEntityType("Order");
    const cust1 = custType.createEntity();
    const order1 = orderType.createEntity() as Entity;


    em.addEntity(order1);
    expect(order1.entityAspect.entityState.isAdded()).toBe(true);
    const emptyCust = order1.getProperty("customer");
    expect(!emptyCust);
    let changeArgs: PropertyChangedEventArgs = null;
    order1.entityAspect.propertyChanged.subscribe((args) => {
      changeArgs = args;
    });
    order1.setProperty("customer", cust1);
    expect(order1.entityAspect.entityState.isAdded()).toBe(true);
    expect(cust1.entityAspect.entityState.isAdded()).toBe(true);
    expect(changeArgs).toBeTruthy();
    expect(changeArgs.propertyName).toBe("customer");
    expect(changeArgs.newValue).toBe(cust1);
    expect(changeArgs.oldValue).toBeNull;
    const orders = cust1.getProperty("orders");
    expect(orders[0]).toBe(order1);
  });

  test("new entity type - infer unmapped boolean datatype", () => {
    const em = TestFns.newEntityManager();
    const Customer = function () {
      // testContext.isBeingEdited = false;
    };
    em.metadataStore.registerEntityTypeCtor("Customer", Customer);

    const customerType = em.metadataStore.getAsEntityType("Customer");
    const unmapped = customerType.unmappedProperties[0];
    expect(unmapped.dataType).toBe(DataType.Boolean);
  });

  function createProductCtor() {
    const init = function (entity: Entity) {
      expect(entity.entityType.shortName).toBe("Product");
      expect(entity.getProperty("isObsolete")).toBe(false);
      entity.setProperty("isObsolete", true);
    };
    return function () {
      this.isObsolete = false;
      this.init = init;
    };

  }

  function checkDefaultValues(structType: StructuralType) {
    const props = structType.getProperties();
    expect(props.length).toBeGreaterThan(0);
    const fn = (structType as EntityType).createEntity || (structType as ComplexType).createInstance;
    const entity = fn.apply(structType);
    props.forEach(function (p: DataProperty | NavigationProperty) {
      const v = entity.getProperty(p.name);
      if (p.isUnmapped) {
        // do nothing
      } else if (p.isDataProperty) {
        const px = p as DataProperty; // needed for typescript
        if (px.isScalar) {
          if (px.isComplexProperty) {
            expect(v !== null).toBe(true);
          } else if (px.defaultValue != null) {
            expect(v).toBe(px.defaultValue);
          } else if (px.isNullable) {
            expect(v).toBeNull();
          }
        } else {
          expect(v.arrayChanged).toBeTruthy();
        }
      } else {
        if (p.isScalar) {
          expect(v).toBeNull();
        } else {
          // relation array
          expect(v.arrayChanged).toBeTruthy();
        }
      }
    });
  }

  function assertFooPropertyDefined(metadataStore: MetadataStore, shouldBe: boolean) {
    const custType = metadataStore.getAsEntityType("Customer");
    const fooProp = custType.getDataProperty('foo');
    if (shouldBe) {
      expect(fooProp && fooProp.isUnmapped).toBe(true);
    } else {
      // 'foo' property should NOT be defined before registration.
      expect(!fooProp).toBe(true);
    }
    return fooProp;
  }



});