const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const serviceAccount = require("./key.json");
const app = express();
const port = 5001;

app.use(cors());
app.use(express.json());

// initialize firebase admin sdk
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// get property using propertyId, use async await, use try catch
app.get("/api/property/:propertyId", async (req, res) => {
  try {
    const propertyId = req.params.propertyId;
    const property = await db.collection("property").doc(propertyId).get();
    const data = property.data();

    res.json({
      ...data,
      id: propertyId,
    });
  } catch (error) {
    res.status(500).send(error);
  }
});

// update the user property using data provided , verify the user token, check if the user owns the property, use async await, use try catch, use put
app.put("/api/user/property", async (req, res) => {
  const { idToken, propertyId, property } = req.body;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    // get userid
    const userId = decodedToken.uid;
    // get property with propertyId
    const propertyRef = db.collection("property").doc(propertyId);
    const propertySnapshot = await propertyRef.get();
    // check if the user owns the property
    if (propertySnapshot.data().ownerId !== userId) {
      return res.status(403).send("Unauthorized");
    }
    let verifiedProp = property;
    verifiedProp.ownerId = userId;
    // update the property
    await propertyRef.update(verifiedProp);
    return res.status(200).send("Property updated");
  } catch (err) {
    console.log("ERROR");
    console.log(err);
    res.status(400).send(err);
  }
});

// get the user's properties list, verify the user, use async await and try catch
app.post("/api/user/property", async (req, res) => {
  try {
    // get the user idToken
    const idToken = req.body.idToken;
    // verify the user
    const user = await admin.auth().verifyIdToken(idToken);
    // get the user's properties list
    const userData = await db.collection("user").doc(user.uid).get();
    // get the properties list from the userData
    const properties = userData.data().properties;

    // loop over each id from the idsList
    const propertiesList = await Promise.all(
      properties.map(async (id) => {
        // get the property from the db
        const property = await db.collection("property").doc(id).get();
        // return the property data

        const propertyWithId = {
          ...property.data(),
          id,
        };
        // get the property's data
        return propertyWithId;
      })
    );

    // send the properties to the user
    res.send(propertiesList);
  } catch (error) {
    console.log("ERROR");
    console.log(error);
    res.status(403).send("Server Error");
    return;
  }
});

// verify the userIdToken and if the user is the owner of the property then delete the property from the property collection and remove it from the user's properties array
// use async await
// use try catch
app.delete("/api/property", async (req, res) => {
  try {
    const { idToken, propertyId } = req.body;

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const propertyRef = await db.collection("property").doc(propertyId);
    const property = await propertyRef.get();
    console.log(property.exists);
    if (property.exists) {
      const propertyData = property.data();
      if (propertyData.ownerId === userId || decodedToken.admin) {
        await propertyRef.delete();
        const userRef = db.collection("user").doc(userId);
        const user = await userRef.get();
        if (user.exists) {
          const userData = user.data();
          const properties = userData.properties;
          const index = properties.indexOf(propertyId);
          if (index > -1) {
            properties.splice(index, 1);
            await userRef.update({ properties });
          }
        }
        res.status(200).send("Property deleted successfully");
      } else {
        res.status(401).send("You are not authorized to delete this property");
      }
    } else {
      res.status(404).send("Property not found");
    }
  } catch (error) {
    res.status(500).send(error);
  }
});

// create a property in firestore after verifying the user, use the users uid as the ownerId of the property
// the property fields are shortAddress, fullAddress, price, ownerId, city, propertySize, propertyType, lotSize, numOfBathrooms, numOfBedrooms, array of images
// use try catch to handle errors
app.post("/api/property", async (req, res) => {
  console.log("///////////////////");
  console.log(req.body);
  const {
    shortAddress,
    fullAddress,
    price,
    idToken,
    city,
    phone,
    propertySize,
    propertyType,
    lotSize,
    numOfBathrooms,
    numOfBedrooms,
    images,
  } = req.body;

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    if (!decodedToken) {
      res.status(401).send("Unauthorized");
    } else {
      const { uid } = decodedToken;
      const newProperty = await db.collection("property").add({
        shortAddress,
        fullAddress,
        price,
        ownerId: uid,
        phone: phone,
        city,
        propertySize,
        propertyType,
        lotSize,
        numOfBathrooms,
        numOfBedrooms,
        images,
      });
      // get the array of properties from the user
      const user = await db.collection("user").doc(uid).get();
      const properties = user.data().properties;
      const newPropertiesList = [...properties, newProperty.id];

      // add the property id to the user's properties array
      await db.collection("user").doc(uid).update({
        properties: newPropertiesList,
      });

      res.status(201).send("Property added");
    }
  } catch (error) {
    res.status(500).send(error);
  }
});

// create user record in firestore with email and an empty array of ids
app.post("/api/createUser", async (req, res) => {
  const idToken = req.body.idToken;
  // Verify the ID token
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    if (!decodedToken) {
      res.status(401).send("Unauthorized");
    } else {
      // get user name using admin sdk
      const user = await admin.auth().getUser(decodedToken.uid);
      const uid = decodedToken.uid;
      const email = decodedToken.email;
      const name = user.displayName;
      const photoURL = user.photoURL;

      // create user in firestore
      try {
        db.collection("user").doc(uid).set({
          email: email,
          name: name,
          photoURL: photoURL,
          properties: [],
        });

        res.json({
          status: "success",
          email,
          name,
          photoURL,
        });
      } catch (error) {
        console.log(error);
        res.status(500).send(error);
      }
    }
  } catch (error) {
    res.status(403).send("Invalid token");
    return;
  }
});

// app.post("/api/setCustomClaims", async (req, res) => {
  
//   const idToken = req.body.idToken;
  
//   // Verify the ID token
//   const decodedToken = await admin.auth().verifyIdToken(idToken);
  
//   const uid = decodedToken.uid;
//   const email = decodedToken.email;

//   if (typeof email !== "undefined" && email.endsWith("@admin.com")) {
//     try {
//       await admin.auth().setCustomUserClaims(uid, {
//         admin: true,
//       });

//       const customClaims = decodedToken.customClaims;
//       console.log("ROUT RAN");
//       console.log(customClaims);
//       console.log("--------");

//       await db.collection("user").doc(uid).set({
//         email,
//         properties: [],
//       });

//       res.json({
//         status: "success",
//         newOne: customClaims,
//       });
//     } catch (error) {
//       console.log(error);
//     }
//   } else {
//     // Return nothing.
//     res.json({ status: "ineligible" });
//   }
// });

// listen on port 5001
app.listen(port, () => console.log(`Listening on port ${port}`));
