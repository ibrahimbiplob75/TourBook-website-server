const express=require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const app=express();
const cors=require("cors");
const stripe=require("stripe")(process.env.STRIPE_SECRET_KEY)
var jwt = require('jsonwebtoken');

const port=process.env.PORT || 5000;


// middleware
app.use(cors({
    origin:["http://localhost:5173"],
    credentials:true,
}));
app.use(express.json());




const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASS}@cluster0.npygsvo.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const userData=client.db("TourbookDB").collection("Users")
    const discussionData=client.db("TourbookDB").collection("discussion");
    const membership=client.db("TourbookDB").collection("members");
    const tagsCollection=client.db("TourbookDB").collection("tags");
    const anouncement=client.db("TourbookDB").collection("anouncements")

    //Jwt api
    app.post("/jwt",async(req,res)=>{
      const user=req.body;
      const token=jwt.sign(user,process.env.ACCESS_TOKEN , {
        expiresIn:"24hr"
      })
      console.log(token,user)
      res.send({token});
    })

    const verifyToken=(req,res,next)=>{
      
      if(!req.headers.authorization){
        return res.status(401).send({meassge:"Forbidden access"})
      }
      const token=req.headers.authorization.split(" ")[1]
      jwt.verify(token,process.env.ACCESS_TOKEN,(error,decoded)=>{
        if(error){
          return res.status(401).send({meassge:"Forbidden access"});
        }
        req.decoded=decoded;
        next();
      })
      
    }

    const verifyAdmin=async(req,res,next)=>{
   
      const email=req.decoded.email;
      const query={email:email}
      const user=await userData.findOne(query);
      const isAdmin=user?.role==="admin"
      if(!isAdmin){
        return res.status(403).send({meassge:"Unauthorized access"});
        
      }
      next();
      
      
    }
      
    

    //user api

    app.post("/users",async(req,res)=>{
        const data=req.body;
        console.log(data)
        const query={email:data.email}
        const existedUser= await userData.findOne(query)
        if(existedUser){
          return res.send("User already exited", insertedId=null)
        }
        const result=await userData.insertOne(data)
        res.send(result)
    });

    app.get("/all/users",async(req,res)=>{
      
      const result=await userData.find().toArray();
        res.send(result);
    })
    app.get("/users/:email",async(req,res)=>{
      const email=req.query.email;
      const query={email:email};
      const result=await userData.findOne(query)
      res.send(result);
    })
    app.delete("/users/:id",async(req,res)=>{
      const id=req.params.id;
      const query={_id: new ObjectId(id)};
      const result=await userData.deleteOne(query);
      res.send(result);
    })
    app.patch("/user/admin/:id",verifyToken,async(req,res)=>{
      const id=req.params.id;
      const filter={_id:new ObjectId(id)};
      const Updatedoc={
        $set:{
          role:"admin"
        }
      }
      const result = await userData.updateOne(filter, Updatedoc);
      res.send(result);
    });

    app.get("/users/admin/:email",verifyToken,async(req,res)=>{
        const email=req.params.email;
        if(email !== req.decoded.email){
          return res.status(403).send({meassge:"Unauthorized access"})
        }
        const query={email:email}
        const user=await userData.findOne(query)
        let isAdmin=false;
        if(user){
          isAdmin=user?.role==="admin"
        }
        //console.log(isAdmin);
        res.send({isAdmin})
    })

    //Client site data connections

    app.get("/discussion",async(req,res)=>{
        const result=await discussionData.find().toArray();
        res.send(result);
    });

    app.post("/discussion",verifyToken,async(req,res)=>{
      const data=req.body;
      const result=await discussionData.insertOne(data);
      res.send(result)
    });

    app.get("/discussion/:id",async(req,res)=>{
      const id=req.params.id;
      const query={_id:new ObjectId(id)}
      const result=await discussionData.findOne(query);
      res.send(result)
    });
    app.get("/discussion", async (req, res) => {

          const results = await discussionData.find().toArray();
          res.send(results);
        
    });
    app.delete("/discussion/:id",async(req,res)=>{
      const id=req.params.id;
      const query={_id: new ObjectId(id)};
      const result=await discussionData.deleteOne(query);
      res.send(result);
    })


    app.patch("/discussion/:id",async(req,res)=>{
        const id=req.params.id;
        const update=req.body;
        const query={_id:new ObjectId(id)};
        const updateDoc = {
        $set: {
          title:update.title,
          userName:update.userName,
          email:update.email,
          profileURL:update.profileURL,
          tag:update.tag,
          subTag:update.subTag,
          descriptions:update.descriptions,
          image:update?.image,
          
          }
        }
      const result = await discussionData.updateOne(query, updateDoc);
      res.send(result)
    })

    app.patch("/discussion/:id/like",async(req,res)=>{
        const discussionId = req.params.id;
        const data=req.body;
        const userId=req.body.userID;
        console.log(data.liked)
        const query = { _id: new ObjectId(discussionId) };
        const discussion = await discussionData.findOne(query);

          if (!discussion) {
            return res.status(404).json({ message: 'Discussion not found' });
          }
          const alreadyLiked = Array.isArray(discussion.likes) && discussion.likes.includes(userId);

          if (alreadyLiked) {
            discussion.likes = discussion.likes.filter((likeUserId) => likeUserId !== userId);
          } else {
            discussion.likes = data.liked;
          }
          const updateDoc = {
            $set: {
              likes: discussion.likes,
              LikedUser:[userId],
            },
          };

          const result = await discussionData.updateOne(query, updateDoc);
          res.send(result);
      
    })

    app.post('/discussion/:id/comments', async (req, res) => {
      const discussionId = req.params.id;
      const commentData = req.body;

      try {
        const query = { _id: new ObjectId(discussionId) };
        const discussion = await discussionData.findOne(query);

        if (!discussion) {
          return res.status(404).json({ success: false, message: 'Discussion not found' });
        }

        // Add the new comment to the comments array
        discussion.comments = [...(discussion.comments || []),  {commentData}];

        // Update the discussion document with the new comments
        const updateDoc = {
          $set: {
            comments: discussion.comments,
          },
        };

        const result = await discussionData.updateOne(query, updateDoc);

        res.json({ success: true, message: 'Comment added successfully' });
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
      }
    });

    app.delete("/discussion/:id",async(req,res)=>{
      const id=req.params.id;
      const query={_id:new ObjectId(id)}
      const result=await discussionData.deleteOne(query);
      res.send(result);
    });



// Add a new tag
    app.post('/tags', async (req, res) => {
      
        const { tags } = req.body;
        const tag = { tags, subTags: [] };
        const result = await tagsCollection.insertOne(tag);
        res.send(result);
      
    });

    // Add a new sub-tag to an existing tag
    app.post('/tags/:id/subtags', async (req, res) => {
      
        const { id } = req.params;
        const { subTag } = req.body;

        const result = await tagsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $push: { subTags: subTag } }
        );

       res.json(await tagsCollection.findOne({ _id: new ObjectId(id) }));
     
    });

    // Get all tags with sub-tags
    app.get('/tags', async (req, res) => {
        const tags = await tagsCollection.find().toArray();
        res.send(tags)
    });


    app.post("/anouncement",async(req,res)=>{
      const data=req.body;
      const result=await anouncement.insertOne(data);
      res.send(result);

    })
    app.get("/anouncement",async(req,res)=>{
      const result=await anouncement.find().toArray();
      res.send(result);
    })
    app.get("/announcement/:id",async(req,res)=>{
      const id=req.params.id;
      const query={_id:new ObjectId(id)};
      const result=await anouncement.findOne(query)
      res.send(result);
    })


    app.post("/create-payment-intent", async (req, res) => {
      const {price}=req.body;
      const amount=parseInt(price*100);
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount:amount,
        currency: "usd",
        payment_method_types:["card"]
      });
      
      res.send({
      clientSecret: paymentIntent.client_secret,
      });

    });

    app.get("/payments/:email",async(req,res)=>{
      const email=req.params.email;
      console.log(email)

      // if(req.params.email!==req.decoded.email){
      //   return res.status(403).send({meassge:"Unauthorized access"})
      // }
      const query={email:email};
      const result=await membership.findOne(query);
      res.send(result);
    });
    

    app.post("/payments",async(req,res)=>{
        const data=req.body;
        const paymentResult=await membership.insertOne(data);
        
        res.send(paymentResult);
    })



    
  } finally {
    
    //await client.close();
  }
}
run().catch(console.dir);


app.get("/",async(req,res)=>{
    res.send("TourBook server is running now !!!!");
})

app.listen(port,async(req,res)=>{
    console.log(`TourBook server is running on port ${port}`);
})
