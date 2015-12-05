(function(){

var CANVAS_SIZE = 800;
var POLYGON_FILL_COLOR = '#000000';
var MIN_CELL_SIZE = 25;

var searchSpace = new Space(CANVAS_SIZE);
var trianglePoints = [];

function initialize() {
    searchSpace.initialize();
    searchSpace.redraw();

    document.body.appendChild(searchSpace.getCanvas());
}

function Space(size) {
    var self = this;
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');

    var tree = null;
    this.triangles = [];

    var dimensions = {
        w: size,
        h: size
    };

    this.initialize = function() {
        canvas.id = 'main';

        canvas.width = CANVAS_SIZE;
        canvas.height = CANVAS_SIZE;
    };

    this.getCanvas = function() {
        return canvas;
    };

    this.colorAt = function(x, y) {
        var imageData = context.getImageData(x, y, 1, 1).data;

        return {
            r: imageData[0],
            g: imageData[1],
            b: imageData[2]
        };
    };

    this.redraw = function() {
        context.clearRect(0, 0, canvas.width, canvas.height);

        for (var i = 0; i < self.triangles.length; ++i) {
            self.triangles[i].draw(context);
        }

        for (var i = 0; i < trianglePoints.length; ++i) {
            context.fillStyle = '#FF0000';
            context.fillRect(trianglePoints[i].x, trianglePoints[i].y, 2, 2);
        }

        if (tree !== null) {
            tree.draw(context);
        }

        drawLines();
    };

    function drawLines() {
        context.lineWidth = 0.5;
        context.strokeStyle = '#29738C';

        for (var x = 0; x < CANVAS_SIZE; x += MIN_CELL_SIZE) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, CANVAS_SIZE);
            context.stroke();
        }

        for (var y = 0; y < CANVAS_SIZE; y += MIN_CELL_SIZE) {
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(CANVAS_SIZE, y);
            context.stroke();
        }
    }

    // Decompose
    function decompose() {
        tree = new QuadTree(CANVAS_SIZE, CANVAS_SIZE);

        tree.applyDecomposition();

        self.redraw();
    }

    // Event handlers
    function onClick(event) {
        var pos = {
            x: event.clientX - canvas.offsetLeft - 10,
            y: event.clientY - canvas.offsetTop - 10
        };

        pos.x = MIN_CELL_SIZE * Math.round(Math.abs(pos.x / MIN_CELL_SIZE));
        pos.y = MIN_CELL_SIZE * Math.round(Math.abs(pos.y / MIN_CELL_SIZE));

        trianglePoints.push(pos);

        if (trianglePoints.length == 3) {
            self.triangles.push(
                new Triangle(trianglePoints)
            );

            trianglePoints = [];

            if (self.triangles.length === 5) {
                decompose();
            }
        }

        self.redraw();
    }

    canvas.addEventListener('click', onClick, false);
}

function Triangle(points) {
    var self = this;
    this.verts = points;
    this.bbox = {};

    function generateBBox() {
        var min = {x: null, y: null};
        var max = {x: null, y: null};

        for (var i = 0; i < self.verts.length; ++i) {
            min.x = min.x === null ? self.verts[i].x : Math.min(self.verts[i].x, min.x);
            min.y = min.y === null ? self.verts[i].y : Math.min(self.verts[i].y, min.y);

            max.x = max.x === null ? self.verts[i].x : Math.max(self.verts[i].x, max.x);
            max.y = max.y === null ? self.verts[i].y : Math.max(self.verts[i].y, max.y);
        }

        self.bbox = {
            x: min.x,
            y: min.y,
            w: max.x - min.x,
            h: max.y - min.y
        };
    }

    this.coarseIntersectionTest = function(x, y, w, h) {
        return self.bbox.x < x + w && self.bbox.x + self.bbox.w > x && self.bbox.y < y + h && self.bbox.y + self.bbox.h > y;
    };

    this.pointTriangleTest = function(point) {
        var testOne,
            testTwo,
            testThree;

        testOne = getSign(point, self.verts[0], self.verts[1]) < 0;
        testTwo = getSign(point, self.verts[1], self.verts[2]) < 0;
        testThree = getSign(point, self.verts[2], self.verts[0]) < 0;

        return (testOne == testTwo) && (testTwo == testThree);
    };

    this.draw = function(cxt) {
        cxt.fillStyle = POLYGON_FILL_COLOR;
        cxt.beginPath();

        if (self.verts.length) {
            cxt.moveTo(self.verts[0].x, self.verts[0].y);

            for (var i = 1; i < self.verts.length; ++i) {
                cxt.lineTo(self.verts[i].x, self.verts[i].y);
            }
        }

        cxt.closePath();
        cxt.fill();
    };

    // For point in triangle test
    function getSign(one, two, three) {
        return (one.x - three.x) * (two.y - three.y) - (two.x - three.x) * (one.y - three.y);
    }

    generateBBox();
}

function QuadTree(baseWidth, baseHeight) {
    var root = new QuadNode(0, 0, baseWidth, baseHeight);

    this.draw = function(cxt) {
        root.draw(cxt);
    };

    this.applyDecomposition = function() {
        decompose(root);
    };

    function decompose(node) {
        if (node) {
            // Mixed, blocked, or free
            node.passable = getPassable(node);

            if (node.passable === 'mixed') {
                node.subDivide();

                decompose(node.topLeft);
                decompose(node.topRight);
                decompose(node.botLeft);
                decompose(node.botRight);

                // False positive check
                if (node.hasChildren() === false || (node.topLeft.passable === 'yes' && node.topRight.passable === 'yes' && node.botLeft.passable === 'yes' && node.botRight.passable === 'yes')) {
                    node.passable = 'yes';
                    node.unite();
                }
            }
        }
    }

    function getPassable(node) {
        var openCount = 0, closeCount = 0;
        var result;

        for (var tri = 0; tri < searchSpace.triangles.length; ++tri) {
            var currTri = searchSpace.triangles[tri];
            var currOpen = 0, currClose = 0;

            // If bounding boxes intersect, add to close count, then test corners of node box
            if (currTri.coarseIntersectionTest(node.getPos().x, node.getPos().y, node.getSize().w, node.getSize().h)) {
                var corners = node.getCorners();

                currClose++;

                for (var p = 0; p < corners.length; ++p) {
                    if (currTri.pointTriangleTest(corners[p])) {
                        currClose++;
                    } else {
                        currOpen++;
                    }
                }
            }

            // If we find that the node is blocked, stop bothering
            if (currOpen === 0 && currClose > 0) {
                openCount = 0;
                closeCount = 1;
                break;
            } else {
                openCount += currOpen;
                closeCount += currClose;
            }
        }

        if (openCount === 0 && closeCount > 0) {
            result = 'no';
        } else if (closeCount === 0 && openCount >= 0) {
            result = 'yes';
        } else {
            result = 'mixed';
        }

        console.log('o: ' + openCount + ', c: ' + closeCount + ', result: ' + result);

        return result;
    }
}

function QuadNode(x, y, w, h) {
    var self = this;
    var position = {x: x, y: y};
    var size = {w: w, h: h};

    this.topLeft = null;
    this.topRight = null;
    this.botLeft = null;
    this.botRight = null;

    this.passable = 'yes';

    this.getPos = function() {
        return position;
    };

    this.getSize = function() {
        return size;
    };

    this.getCorners = function() {
        return [
            {x: position.x, y: position.y},
            {x: position.x + size.w, y: position.y},
            {x: position.x + size.w, y: position.y + size.h},
            {x: position.x, y: position.y + size.h}
        ];
    };

    this.subDivide = function() {
        var halfW = size.w / 2;
        var halfH = size.h / 2;

        if (halfW > 5 && halfH > 5) {
            //console.log('Subdivide (' + position.x + ', ' + position.y + ', ' + size.w + ', ' + size.h + '): [' + halfW + ', ' + halfH + ']');

            self.topLeft = new QuadNode(position.x, position.y, halfW, halfH);
            self.topRight = new QuadNode(position.x + halfW, position.y, halfW, halfH);
            self.botLeft = new QuadNode(position.x, position.y + halfH, halfW, halfH);
            self.botRight = new QuadNode(position.x + halfW, position.y + halfH, halfW, halfH);
        }
    };

    this.unite = function() {
        self.topLeft = null;
        self.topRight = null;
        self.botLeft = null;
        self.botRight = null;
    };

    this.hasChildren = function() {
        return self.topLeft !== null;
    };

    function getFill() {
        if (self.passable === 'yes') {
            return '#00FF00';
        } else if (self.passable === 'no') {
            return '#FF0000';
        } else {
            return '#0000FF';
        }
    }

    this.draw = function(cxt) {
        cxt.fillStyle = getFill();
        cxt.strokeStyle = '#000000';
        cxt.lineWidth = 2;

        cxt.fillRect(position.x , position.y, size.w, size.h);
        cxt.strokeRect(position.x , position.y, size.w, size.h);

        if (self.topLeft) {
            self.topLeft.draw(cxt);
        }
        if (self.topRight) {
            self.topRight.draw(cxt);
        }
        if (self.botLeft) {
            self.botLeft.draw(cxt);
        }
        if (self.botRight) {
            self.botRight.draw(cxt);
        }
    };
}

initialize();

})();