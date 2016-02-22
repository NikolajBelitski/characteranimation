(function() {
    /**
     * The StandardCamera offers basic mouse and touch interaction with an XML3D scene.
     *
     * @param {HTMLElement} element The element that this camera will control
     * @param {Object} opt
     * @param {Object} dcamera - duplicate camera
     * @constructor
     */
    XML3D.StandardCamera = function(element, opt, dcamera) {
        if (!element || !element.tagName) {
            throw("Must provide an element to control when initializing the StandardCamera!");
        }
        if (element.hasAttribute("style")) {
            XML3D.debug.logWarning("This camera controller does not support CSS transforms, unexpected things may happen! Try using a <transform> element instead.");
        }
        if (XML3D.StandardCamera.Instance) {
            XML3D.StandardCamera.Instance.detach();
        }
        XML3D.StandardCamera.Instance = false; // Prevent the camera from self-initializing

        opt = opt || {};
        this.element = element;
        this.xml3d = this.getXML3DForElement(element);
        
        this.dcamera = dcamera;

        this.mode = opt.mode || "examine";
        this.touchTranslateMode = opt.touchTranslateMode || "twofinger";

        this.examinePoint = opt.examinePoint || this.getInverseTranslationOfParent(element);
        this.rotateSpeed = opt.rotateSpeed || 3;
        this.zoomSpeed = opt.zoomSpeed || 20;
        this.useKeys = opt.useKeys !== undefined ? opt.useKeys : false;
        this.mousemovePicking = true;
        this.activeKeys = {};

        this.transformInterface = new TransformInterface(this.element, this.xml3d);
        this.prevPos = {x: -1, y: -1};
        this.prevTouchPositions = [];
        this.prevTouchPositions[0] = {
            x : -1,
            y : -1
        };
        this.prevZoomVectorLength = null;
        this.upVector = this.transformInterface.upVector;

        this.attach();
    };

    /**
     * Translate the camera by the given vector
     * @param {XML3D.Vec3} vec The vector to translate the camera by
     */
    XML3D.StandardCamera.prototype.translate = function(vec) {
        this.transformInterface.translate(vec);
    };

    /**
     * Rotate the camera with the given quaternion rotation
     * @param {XML3D.Quat} rot The quaternion rotation to rotate the camera with
     */
    XML3D.StandardCamera.prototype.rotate = function(rot) {
        this.transformInterface.rotate(rot);
    };

    /**
     * Moves the camera to a new position and orientation that centers on the given object. After calling this the camera
     * will be positioned in front of the object looking down the Z axis at it. The camera will be placed far enough away
     * that the whole object is visible. If in examine mode the examine point will be set to the center of the object.
     *
     * @param {HTMLElement} element The element to be examined. May be a <group>, <mesh> or <model> tag.
     */
    XML3D.StandardCamera.prototype.examine = function(element) {
        if (!element.getWorldBoundingBox) {
            XML3D.debug.logError(element + " is not a valid examine target. Valid target elements include <group>, <mesh> and <model>.");
            return;
        }
        var bb = element.getWorldBoundingBox();
        var center = bb.center();
        var r = center.len();
        var newPos = center.clone();
        newPos.z += r / Math.tan(this.transformInterface.fieldOfView / 2);
        this.transformInterface.position = newPos;
        this.transformInterface.orientation = new XML3D.Quat();
        this.examinePoint = bb.center();
    };

    /**
     * Sets the examine point of the camera. This has no effect if the camera is in "fly" mode.
     * @param p The new examine point
     */
    XML3D.StandardCamera.prototype.setExaminePoint = function(p) {
        this.examinePoint = p;
    };

    /**
     * Orient the camera to look at the given point
     *
     * @param {XML3D.Vec3} point
     */
    XML3D.StandardCamera.prototype.lookAt = function(point) {
        this.transformInterface.lookAt(point);
    };

    /**
     * Start listening for input events.
     */
    XML3D.StandardCamera.prototype.attach = function() {
        var self = this;
        this._evt_mousedown = function(e) {self.mousePressEvent(e);};
        this._evt_mouseup = function(e) {self.mouseReleaseEvent(e);};
        this._evt_mousemove = function(e) {self.mouseMoveEvent(e);};

        this.xml3d.addEventListener("mousedown", this._evt_mousedown, false);
        document.addEventListener("mouseup", this._evt_mouseup, false);
        document.addEventListener("mousemove",this._evt_mousemove, false);
    };

    /**
     * Stop listening for input events.
     */
    XML3D.StandardCamera.prototype.detach = function() {
        this.xml3d.removeEventListener("mousedown", this._evt_mousedown, false);
        document.removeEventListener("mouseup", this._evt_mouseup, false);
        document.removeEventListener("mousemove",this._evt_mousemove, false);
    };


    //---------- End public API ----------------

    Object.defineProperty(XML3D.StandardCamera.prototype, "width", {
        get : function() {
            return this.xml3d.width;
        }
    });
    Object.defineProperty(XML3D.StandardCamera.prototype, "height", {
        get : function() {
            return this.xml3d.height;
        }
    });

    XML3D.StandardCamera.prototype.getXML3DForElement = function(element) {
        var node = element.parentNode;
        while (node && node.localName !== "xml3d") {
            node = node.parentNode;
        }
        if (!node) {
            throw("Could not find the root XML3D element for the given element.");
        }
        return node;
    };

    XML3D.StandardCamera.prototype.getInverseTranslationOfParent = function(element) {
        if (!element.parentElement.getWorldMatrix) {
            return new XML3D.Vec3(0,0,0);
        }
        var tmat = element.parentElement.getWorldMatrix();
        tmat = tmat.invert();
        return new XML3D.Vec3(tmat.m41, tmat.m42, tmat.m43);
    };

    XML3D.StandardCamera.prototype.NO_MOUSE_ACTION = "no_action";
    XML3D.StandardCamera.prototype.ROTATE = "rotate";
    
    XML3D.StandardCamera.prototype.prevP = null;
    XML3D.StandardCamera.prototype.elemP = null
        
    //Projectingpointer on the trackball sphere
    XML3D.StandardCamera.prototype.getSphereProjection = function(mx,my)
    {
        var x,y,z;
        var q;
        var radius, centerX, centerY;
        
        //Position of our sphere
        radius = 89;
        centerX = 935;
        centerY = 409;

        //Normalization
        x = (- mx + centerX);
        y = (my - centerY);     
        
        r = x*x + y*y;
        
        if(r >= radius*radius)
        {
            return false;
        }
        else
        {
            z = Math.sqrt(radius*radius - r);
        }
        
        return new XML3D.Vec3(x,y,z);
    }

    XML3D.StandardCamera.prototype.mousePressEvent = function(event) {
        // This listener captures events on the XML3D element only
        var ev = event || window.event;
        if(this.dcamera != null)
        {
            //Translate event in the second camera
            this.dcamera.mousePressEvent(event);            
        }
        
        
        event.preventDefault(); // Prevent text dragging
        
        switch (ev.button) {
            case 0:
                this.action = this.ROTATE;
                break;
            default:
                this.action = this.NO_MOUSE_ACTION;
        }

        this.prevPos.x = ev.pageX;
        this.prevPos.y = ev.pageY;
        
        if (this.action !== this.NO_MOUSE_ACTION) {
            //Disable object picking during camera actions
            this.mousemovePicking = XML3D.options.getValue("renderer-mousemove-picking");
            XML3D.options.setValue("renderer-mousemove-picking", false);
        }
    };

    XML3D.StandardCamera.prototype.mouseReleaseEvent = function(event) {
        if (this.action !== this.NO_MOUSE_ACTION) {
            XML3D.options.setValue("renderer-mousemove-picking", this.mousemovePicking);
        }

        this.action = this.NO_MOUSE_ACTION;
    };

    XML3D.StandardCamera.prototype.mouseMoveEvent = function(event) {
        
        if(this.dcamera != null)
        {
            this.dcamera.mouseMoveEvent(event);
        }
        
        var ev = event || window.event;

        if (!this.action)
            return;
        var dx, dy, mx, my;
        
        switch(this.action) {
            case(this.ROTATE):
                
                //Get the projections
                var p1 = this.getSphereProjection(this.prevPos.x, this.prevPos.y);
                var p2 = this.getSphereProjection(ev.pageX, ev.pageY);
                
                if(p1 == false || p2 == false)
                {
                    p1 = this.prevP;
                }
                
                //Length of the vectors
                var p1l = Math.sqrt(p1.x*p1.x + p1.y*p1.y + p1.z*p1.z);
                var p2l = Math.sqrt(p2.x*p2.x + p2.y*p2.y + p2.z*p2.z);
                
                //Scalar product with floating point error correction
                var cpr = p1.dot(p2);

                //Our angle
                var teta = Math.acos(cpr / (p1l*p2l));
                
                var p1n = new XML3D.Vec3(p1.x / p1l, p1.y / p1l, p1.z / p1l);
                var p2n = new XML3D.Vec3(p2.x / p2l, p2.y / p2l, p1.z / p2l);
                
                var p3 = p1n.cross(p2n);
                
                var q = new XML3D.Quat();
                
                //Is this a first or second camera?
                if(this.dcamera != null)
                {
                    //Lenth of rotational axis.
                    var p3l = Math.sqrt(p3.x*p3.x + p3.y*p3.y + p3.z*p3.z);
                    
                    //If it is 0, than we can both vectors are the same
                    if(p3l == 0)
                    {                        
                        return;
                    }
                    
                    //Quaternion
                    q.w = Math.cos(teta / 2);
                    q.x = (p3.x / p3l)*Math.sin(teta / 2);
                    q.y = (p3.y / p3l)*Math.sin(teta / 2);
                    q.z = (p3.z / p3l)*Math.sin(teta / 2);                    
                }
                else
                {
                    //We can directly calculate the quaternion
                    q.w = p1n.dot(p2n);
                    q.x = p3.x;
                    q.y = p3.y;
                    q.z = p3.z;                    
                }
                
                this.transformInterface.rotateAroundPoint(q, this.examinePoint);
                break;
                
        }

        if (this.action != this.NO_MOUSE_ACTION)
        {
            this.prevPos.x = ev.pageX;
            this.prevPos.y = ev.pageY;
        }
    };

    var TransformInterface = function(element, xml3d) {
        this.element = element;
        this.xml3d = xml3d;
        this.transform = this.getTransformForElement(element);
    };

    TransformInterface.prototype.getTransformForElement = function(element) {
        if (element.hasAttribute("transform")) {
            //If the element already has a transform we can reuse that
            return document.querySelector(element.getAttribute("transform"));
        }
        return this.createTransformForView(element);
    };

    var elementCount = 0;
    TransformInterface.prototype.createTransformForView = function(element) {
        var transform = document.createElement("transform");
        var tid = "Generated_Camera_Transform_" + elementCount++;
        transform.setAttribute("id", tid);
        element.parentElement.appendChild(transform);
        element.setAttribute("transform", "#"+tid);
        return transform;
    };

    Object.defineProperty(TransformInterface.prototype, "orientation", {
        get: function() {
            return XML3D.Quat.fromAxisAngle(this.transform.rotation);
        },

        set: function(orientation) {
            var aa = XML3D.AxisAngle.fromQuat(orientation);
            this.transform.setAttribute("rotation", aa.toDOMString());
        }
    });

    Object.defineProperty(TransformInterface.prototype, "position", {
        get: function() {
            return this.transform.translation;
        },

        set: function(position) {
            this.transform.setAttribute("translation", position.toDOMString());
        }
    });

    Object.defineProperty(TransformInterface.prototype, "direction", {
        get: function() {
            var dir = new XML3D.Vec3(0, 0, -1);
            return dir.mul(this.orientation);
        },

        set: function(dir) {
            throw("Direction cannot be set directly.");
        }
    });

    Object.defineProperty(TransformInterface.prototype, "upVector", {
        get: function() {
            var up = new XML3D.Vec3(0, 1, 0);
            return up.mul(this.orientation);
        },

        set: function(up) {
            throw("Up vector cannot be set directly");
        }
    });

    /**
     *  This is always the VERTICAL field of view in radians
     */
    Object.defineProperty(TransformInterface.prototype, "fieldOfView", {
        get: function() {
            var fovh = this.element.querySelector("float[name=fovHorizontal]");
            if (fovh) {
                var h = fovh.value[0];
                return 2 * Math.atan(Math.tan(h / 2.0) * this.xml3d.width / this.xml3d.height);
            }
            var fovv = this.element.querySelector("float[name=fovVertical]");
            if (fovv) {
                return fovv.value[0];
            }
            return (45 * Math.PI / 180); //Default FOV
        },

        set: function(fov) {
            var fovh = this.element.querySelector("float[name=fovHorizontal]");
            if (fovh) {
                fovh.parentNode.removeChild(fovh);
            }
            var fovv = this.element.querySelector("float[name=fovVertical]");
            if (!fovv) {
                fovv = document.createElement("float");
                fovv.setAttribute("name", "fovVertical");
                this.element.appendChild(fovv);
            }
            fovv.textContent = fov;
        }
    });

    TransformInterface.prototype.rotateAroundPoint = function(q0, p0) {
        this.orientation = this.orientation.mul(q0).normalize();
        var aa = XML3D.AxisAngle.fromQuat(q0);
        var axis = this.inverseTransformOf(aa.axis);
        var tmpQuat = XML3D.Quat.fromAxisAngle(axis, aa.angle);
        this.position = this.position.subtract(p0).mul(tmpQuat).add(p0);
    };

    TransformInterface.prototype.lookAround = function(rotSide, rotUp, upVector) {
        var check = rotUp.mul(this.orientation);

        var tmp = new XML3D.Vec3(0,0,-1).mul(check);
        var rot = rotSide.clone();
        if (Math.abs(upVector.dot(tmp)) <= 0.95) {
            rot = rot.mul(rotUp);
        }

        rot = rot.normalize().mul(this.orientation).normalize();
        this.orientation = rot;
    };

    TransformInterface.prototype.rotate = function(q0) {
        this.orientation = this.orientation.mul(q0).normalize();
    };

    TransformInterface.prototype.translate = function(t0) {
        this.position = this.position.add(t0);
    };

    TransformInterface.prototype.inverseTransformOf = function(vec) {
        return vec.mul(this.orientation);
    };

    TransformInterface.prototype.lookAt = function(point) {
        var dir = point.sub(this.position).normalize();
        var up = new XML3D.Vec3(0,1,0);
        var orientation = this.orientation;
        var basisX = new XML3D.Vec3(dir).cross(up);
        if (!basisX.length()) {
            basisX = new XML3D.Vec3(1,0,0).mul(orientation);
        }
        var basisY = basisX.clone().cross(dir);
        var basisZ = new XML3D.Vec3(dir).negate();
        this.orientation = XML3D.Quat.fromBasis(basisX, basisY, basisZ);
    };
})();

// Automatically creates a camera instance using the first view element on the page
window.addEventListener("load", function() {
    var xml3d = document.querySelector("xml3d");
    var init = function() {
        var view;
        if (xml3d.hasAttribute("view")) {
            view = document.querySelector(xml3d.getAttribute("view"));
        } else {
            view = document.querySelector("view");
        }
        if (view && XML3D.StandardCamera.Instance !== false)
            XML3D.StandardCamera.Instance = new XML3D.StandardCamera(view, {mode: "fly", useKeys: true});
    };
    if (xml3d) {
        if (xml3d.complete)
            init();
        else
            xml3d.addEventListener("load", init);
    }
});
